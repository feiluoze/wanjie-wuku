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

// Repair one narrowly defined typo only at an object-key position. All keys must
// be declared by the captured schema; strings and values are copied byte-for-byte.
export function repairKnownKeyQuotes(source,allowedKeys){
 if(typeof source!=='string'||source.length>120000||!allowedKeys?.size)return null;
 let i=0;const insertions=[];
 const skip=()=>{while(i<source.length&&/\s/.test(source[i]))i++;};
 const string=()=>{const start=i++;let escaped=false;for(;i<source.length;i++){const c=source[i];if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"'){i++;return JSON.parse(source.slice(start,i));}}throw Error('unclosed string');};
 const value=(depth=0)=>{
  if(depth>64)throw Error('depth');skip();const c=source[i];
  if(c==='"'){string();return;}
  if(c==='{'||c==='['){const object=c==='{',close=object?'}':']',keys=new Set();i++;skip();if(source[i]===close){i++;return;}
   while(i<source.length){
    if(object){
     skip();if(source[i]!=='"')throw Error('key');
     const missing=source.slice(i).match(/^"([A-Za-z_][A-Za-z0-9_]{0,79}):\s*(?=["{\[\d\-tfn])/);
     let key;
     if(missing&&allowedKeys.has(missing[1])){key=missing[1];i+=key.length+1;insertions.push(i);if(insertions.length>8)throw Error('repair limit');}
     else key=string();
     if(keys.has(key))throw Error('duplicate key');keys.add(key);skip();if(source[i++]!==':')throw Error('colon');
    }
    value(depth+1);skip();if(source[i]===close){i++;return;}if(source[i++]!==',')throw Error('separator');skip();
   }throw Error('unclosed container');
  }
  const m=source.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!m)throw Error('value');i+=m[0].length;
 };
 try{value();skip();if(i!==source.length||!insertions.length)return null;let raw=source;for(const at of insertions.reverse())raw=raw.slice(0,at)+'"'+raw.slice(at);return {data:JSON.parse(raw),raw,repairs:insertions.length};}catch{return null;}
}
