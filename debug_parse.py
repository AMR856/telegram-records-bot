import re
from app.services.parser import MessageParser

src = open('tests/test_parser.py', encoding='utf-8').read()
import re as _re
# find the test_thousands_separator message: first quoted string after def test_thousands_separator
idx = src.index('def test_thousands_separator')
seg = src[idx:idx+1200]
qs = _re.findall(r'"((?:[^"\\]|\\.)*)"', seg)
print('quoted strings in segment:')
for i, q in enumerate(qs):
    print(i, repr(q[:200]))
