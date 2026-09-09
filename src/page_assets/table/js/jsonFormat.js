/** Validate JSON, then indent its original tokens without converting number text. */
export function formatJsonLosslessly(text) {
  // Discard the parsed value: numbers must never be serialized from JS Numbers.
  JSON.parse(text);
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[^\s{}[\],:]+|[{}[\],:]/g);
  let depth = 0;
  let result = '';
  const newline = () => '\n' + '  '.repeat(depth);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '{' || token === '[') {
      result += token;
      depth += 1;
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') result += newline();
    } else if (token === '}' || token === ']') {
      depth -= 1;
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') result += newline();
      result += token;
    } else if (token === ',') {
      result += token + newline();
    } else if (token === ':') {
      result += ': ';
    } else {
      result += token;
    }
  }
  return result;
}
