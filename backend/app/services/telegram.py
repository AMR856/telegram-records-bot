import httpx


# Custom exception class for handling errors returned by the Telegram API or network issues
class TelegramError(Exception):
    def __init__(self, message: str, *, code: str = "telegram_error", fatal: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        # 'fatal' indicates whether the error is unrecoverable (e.g., invalid token). 
        # If True, the background poller should completely stop rather than retrying.
        self.fatal = fatal


# An asynchronous client for interacting with the Telegram Bot API using httpx
class TelegramClient:
    def __init__(self, token: str, poll_timeout: int = 30):
        self._token = token
        self._poll_timeout = poll_timeout
        # Configure the async HTTP client with a base URL including the bot token
        self._client = httpx.AsyncClient(
            base_url=f"https://api.telegram.org/bot{token}",
            # Custom timeout settings. The 'read' timeout is deliberately longer than the 
            # long-polling timeout to ensure the client doesn't prematurely drop the connection 
            # while waiting for Telegram to return updates.
            timeout=httpx.Timeout(
                connect=10.0,
                read=poll_timeout + 20.0,
                write=15.0,
                pool=10.0,
            ),
        )

    # Safely closes the underlying httpx client sessions
    async def close(self) -> None:
        await self._client.aclose()

    # Core internal method to send HTTP POST requests to the Telegram API
    async def _call(
        self,
        method: str,
        payload: dict | None = None,
        *,
        timeout: float | None = None,
    ):
        try:
            # Send the request to the specified Telegram API method
            response = await self._client.post(f"/{method}", json=payload or {}, timeout=timeout)
        except httpx.HTTPError as error:
            # Catch raw network errors (e.g., DNS issues, connection resets)
            raise TelegramError(
                "Could not reach Telegram. Check the server network connection.",
                code="network_error",
            ) from error

        try:
            # Attempt to parse the JSON response
            data = response.json()
        except ValueError as error:
            # Catch cases where Telegram returns non-JSON (like a 502 Bad Gateway HTML page)
            raise TelegramError(
                "Telegram returned an unexpected response.", code="bad_response"
            ) from error

        # If the API call was successful, return the actual payload inside 'result'
        if data.get("ok"):
            return data.get("result")

        # Handle API-level errors returned by Telegram
        description = str(data.get("description") or "Telegram request failed")[:300]
        error_code = data.get("error_code") or response.status_code
        
        # 401 Unauthorized: The bot token is wrong or revoked. This is unrecoverable.
        if error_code == 401:
            raise TelegramError(
                "The bot token is invalid or has been revoked.", code="invalid_token", fatal=True
            )
            
        # 409 Conflict: Another instance is already polling this token. 
        # Telegram strictly limits getUpdates to one connection per bot.
        if error_code == 409:
            raise TelegramError(
                "This bot token is already being polled elsewhere. "
                "Telegram allows only one getUpdates listener per bot token.",
                code="polling_conflict",
                fatal=True,
            )
            
        # 429 Too Many Requests: Rate limit hit. Extract the suggested wait time.
        if error_code == 429:
            retry_after = (data.get("parameters") or {}).get("retry_after", 5)
            raise TelegramError(
                f"Telegram rate limit reached. Retry in {retry_after} seconds.",
                code="rate_limited",
            )
            
        # Fallback for any other Telegram API errors (e.g., 400 Bad Request)
        raise TelegramError(description, code="telegram_api_error")

    # Validates the bot token and returns basic information about the bot itself
    async def get_me(self) -> dict:
        return await self._call("getMe", timeout=15)

    # Checks the current webhook status. Useful to verify if webhooks are blocking getUpdates.
    async def get_webhook_info(self) -> dict:
        return await self._call("getWebhookInfo", timeout=15)

    # Resolves a channel input (like an @username) to get its raw ID and details
    async def get_chat(self, channel_input: str) -> dict:
        return await self._call("getChat", {"chat_id": channel_input}, timeout=20)

    # Checks the bot's membership status or permissions within a specific chat
    async def get_chat_member(self, chat_id: int, user_id: int) -> dict:
        return await self._call(
            "getChatMember", {"chat_id": chat_id, "user_id": user_id}, timeout=20
        )

    # The primary method for long-polling. Fetches new messages/events from Telegram.
    async def get_updates(
        self,
        *,
        offset: int | None,
        timeout: int,
        limit: int = 100,
        allowed_updates: list[str] | None = None,
    ) -> list[dict]:
        payload: dict = {"timeout": timeout, "limit": limit}
        # 'offset' acknowledges previously received updates so Telegram drops them from the queue
        if offset is not None:
            payload["offset"] = offset
        # Restrict the types of updates the bot receives (e.g., only "message" or "channel_post")
        if allowed_updates is not None:
            payload["allowed_updates"] = allowed_updates
            
        # The timeout here must be slightly longer than the requested long-poll timeout
        return await self._call("getUpdates", payload, timeout=max(15.0, timeout + 20.0))

    # Removes any active webhook. getUpdates will fail with a 409 if a webhook is set.
    async def delete_webhook(self) -> bool:
        return await self._call("deleteWebhook", {"drop_pending_updates": False}, timeout=20)