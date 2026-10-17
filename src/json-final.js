// Only remove JSON trailing commas outside strings. Never complete missing data.
export function parseFinalJSON(value) {
 try{return JSON.parse(value);}catch(original){
  let quoted=false,escaped=false,clean='';
  for(let i=0;i<value.length;i++){
   const c=value[i];
   if(quoted){clean+=!escaped&&c.charCodeAt(0)<32?JSON.stringify(c).slice(1,-1):c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;clean+=c;continue;}
   if(c===','){let j=i+1;while(/\s/.test(value[j]||'')&&j<value.length)j++;if(value[j]==='}'||value[j]===']')continue;}
   clean+=c;
  }
  try{return JSON.parse(clean);}catch(error){
   try{return JSON.parse(insertMissingCommas(clean));}catch{throw clean===value?original:error;}
  }
 }
}

// Grammar-only repair: insert separators between complete values/keys. No values,
// quotes, names, brackets or identifiers are synthesized.
function insertMissingCommas(source){
 const tokens=[];let i=0;
 while(i<source.length){
  if(/\s/.test(source[i])){i++;continue;}
  const start=i,c=source[i];
  if(c==='"'){let escape=false;i++;for(;i<source.length;i++){const x=source[i];if(escape)escape=false;else if(x==='\\')escape=true;else if(x==='"'){i++;break;}}const value=source.slice(start,i);JSON.parse(value);tokens.push(value);}
  else if('{}[],:'.includes(c)){tokens.push(c);i++;}
  else{const m=source.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!m)throw Error('invalid token');tokens.push(m[0]);i+=m[0].length;}
  if(tokens.length>100000)throw Error('token limit');
 }
 let at=0;
 const value=(depth=0)=>{
  if(depth>64)throw Error('depth');const token=tokens[at++];if(!token)throw Error('missing value');
  if(token==='{'||token==='['){const object=token==='{',close=object?'}':']',out=[token];if(tokens[at]===close){at++;return token+close;}
   while(true){
    if(object){const key=tokens[at++];if(!key?.startsWith('"')||tokens[at++]!==':')throw Error('missing key');out.push(key,':');}
    out.push(value(depth+1));
    if(tokens[at]===close){at++;out.push(close);break;}
    if(tokens[at]===','){at++;out.push(',');continue;}
    if(object?tokens[at]?.startsWith('"')&&tokens[at+1]===':':tokens[at]&&!['}',']',':',','].includes(tokens[at])){out.push(',');continue;}
    throw Error('unclosed container');
   }return out.join('');
  }
  if(['}',']',':',','].includes(token))throw Error('invalid value');JSON.parse(token);return token;
 };
 const result=value();if(at!==tokens.length)throw Error('extra root');return result;
}
