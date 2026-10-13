// Only remove JSON trailing commas outside strings. Never complete missing data.
export function parseFinalJSON(value) {
 try{return JSON.parse(value);}catch(original){
  let quoted=false,escaped=false,clean='';
  for(let i=0;i<value.length;i++){
   const c=value[i];
   if(quoted){clean+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;clean+=c;continue;}
   if(c===','){let j=i+1;while(/\s/.test(value[j]||'')&&j<value.length)j++;if(value[j]==='}'||value[j]===']')continue;}
   clean+=c;
  }
  if(clean===value)throw original;
  return JSON.parse(clean);
 }
}
