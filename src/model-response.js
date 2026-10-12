// Read only explicit final-text fields. Reasoning and tool arguments are never prose.
function textParts(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter(p => p && !p.thought && ['text','output_text'].includes(p.type))
    .map(p => typeof p.text === 'string' ? p.text : typeof p.text?.value === 'string' ? p.text.value : '').join('');
}
export function parseModelResponse(data, status = 200) {
  const choice = data?.choices?.[0], message = choice?.message;
  const reason = choice?.finish_reason;
  const finish = ['stop','length','content_filter','tool_calls','function_call'].includes(reason) ? reason : reason ? 'other' : 'missing';
  let format = 'unknown', content = '';
  if (Array.isArray(data?.choices)) {
    format = 'chat-completions';
    content = textParts(message?.content) || (typeof choice?.text === 'string' ? choice.text : '');
  } else if (data?.object === 'response' && Array.isArray(data.output)) {
    format = 'responses';
    content = data.output.filter(p => p.type === 'message' && p.role === 'assistant').map(p => textParts(p.content)).join('');
  }
  const diagnostic = {httpStatus: status, format, finish, choices: Array.isArray(data?.choices) ? data.choices.length : 0,
    contentType: typeof message?.content === 'string' ? 'string' : Array.isArray(message?.content) ? 'parts' : 'missing',
    textCharacters: content.length, reasoningPresent: Boolean(message?.reasoning_content || message?.reasoning || message?.thinking),
    toolsPresent: Boolean(message?.tool_calls?.length || message?.function_call), refusalPresent: Boolean(message?.refusal), providerError: Boolean(data?.error)};
  if (data?.error) return {diagnostic, error:'接口在成功响应中返回错误对象；本次未提交，请查看运行日志中的响应诊断'};
  if (content.trim()) return {content, diagnostic};
  const detail = finish === 'length' ? '生成达到接口输出限制，但未返回最终正文' : finish === 'content_filter' || diagnostic.refusalPresent ? '接口拒绝生成或触发内容过滤' : diagnostic.toolsPresent ? '接口只返回工具调用，没有最终正文' : diagnostic.reasoningPresent ? '接口只返回思考内容，没有最终正文' : format === 'unknown' ? '接口返回格式不在已支持的正文结构中' : '接口返回空正文';
  return {diagnostic, error: detail+'；本次未提交，不会自动重试。可手动改用其他模型或酒馆当前连接'};
}
