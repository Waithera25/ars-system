const fail=message=>{throw Object.assign(Error(message),{status:400})};
const allowed=new Set(['textfield','textarea','email','phoneNumber','number','datetime','select','checkbox','button']);
const clean=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
export function normalizeSchema(value){
 if(!value||value.display&&value.display!=='form'||!Array.isArray(value.components)||value.components.length>40)fail('Use a standard form with up to 40 fields.');
 const keys=new Set();let buttons=0;
 const components=value.components.map(c=>{
  if(!c||!allowed.has(c.type))fail('Use only the supported ARS field types.');
  if(c.type==='button'){buttons++;if(buttons>1)fail('Use one submit button.');return {type:'button',key:'submit',label:'Submit form',action:'submit',theme:'primary',input:true}}
  if(!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(c.key)||['__proto__','prototype','constructor','submit'].includes(c.key)||keys.has(c.key))fail('Each field needs a unique, simple key.');keys.add(c.key);
  const label=clean(c.label);if(!label||/[<>]/.test(label))fail('Use plain text labels without HTML.');
  if(c.calculateValue||c.customDefaultValue||c.logic?.length||c.conditional?.when||c.customConditional||c.validate?.custom||c.validate?.json||c.multiple)fail('Scripts, conditional logic, and multiple-value fields are not supported.');
  const out={type:c.type,key:c.key,label,input:true,validate:{required:!!c.validate?.required}};
  if(['textfield','textarea','email','phoneNumber'].includes(c.type)){const n=Number(c.validate?.maxLength|| (c.type==='textarea'?5000:254));if(!Number.isInteger(n)||n<1||n>10000)fail('Maximum length must be between 1 and 10000.');out.validate.maxLength=n}
  if(c.type==='number'){out.decimalLimit=2;for(const k of ['min','max'])if(c.validate?.[k]!==undefined&&c.validate[k]!==''){const n=Number(c.validate[k]);if(!Number.isFinite(n))fail('Number limits must be finite.');out.validate[k]=n}if(out.validate.min>out.validate.max)fail('Minimum cannot exceed maximum.')}
  if(c.type==='datetime'){out.enableTime=false;out.format='yyyy-MM-dd';out.widget={type:'input'};out.datePicker={disableWeekends:false,disableWeekdays:false}}
  if(c.type==='select'){if(c.dataSrc&&c.dataSrc!=='values')fail('Dropdowns must use static values.');const values=c.data?.values;if(!Array.isArray(values)||!values.length||values.length>100)fail('Add between 1 and 100 dropdown choices.');const used=new Set();out.dataSrc='values';out.widget='html5';out.data={values:values.map(v=>{const label=clean(v.label),value=clean(v.value,100);if(!label||!value||/[<>]/.test(label)||used.has(value))fail('Dropdown choices need unique values and plain labels.');used.add(value);return {label,value}})}}
  return out;
 });
 if(!keys.size)fail('Add at least one data field.');if(!buttons)components.push({type:'button',key:'submit',label:'Submit form',action:'submit',theme:'primary',input:true});
 return {display:'form',components};
}
export function validateAnswers(schema,input){
 if(!input||Array.isArray(input)||typeof input!=='object')fail('Form answers must be an object.');
 const output={};const fields=schema.components.filter(c=>c.type!=='button');
 for(const k of Object.keys(input))if(k!=='submit'&&!fields.some(c=>c.key===k))fail('Unexpected form field: '+k);
 for(const c of fields){const v=input[c.key],empty=v===undefined||v===null||v==='';if(c.validate.required&&(empty||c.type==='checkbox'&&v!==true))fail(c.label+' is required.');if(empty){output[c.key]=c.type==='checkbox'?false:null;continue}
  if(c.type==='checkbox'){if(typeof v!=='boolean')fail(c.label+' must be yes or no.');output[c.key]=v}
  else if(c.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v*100-Math.round(v*100))>0.0001)fail(c.label+' must be a number with up to two decimal places.');if(c.validate.min!==undefined&&v<c.validate.min||c.validate.max!==undefined&&v>c.validate.max)fail(c.label+' is outside the allowed range.');output[c.key]=v}
  else {if(typeof v!=='string')fail(c.label+' must be text.');const s=v.trim();if(c.validate.required&&!s)fail(c.label+' is required.');if(s.length>(c.validate.maxLength||10000))fail(c.label+' is too long.');if(c.type==='email'&&s&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Enter a valid email address.');if(c.type==='select'&&!c.data.values.some(x=>x.value===s))fail('Select an available option for '+c.label);if(c.type==='datetime'&&s){const date=s.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(s))||new Date(date).toISOString().slice(0,10)!==date)fail('Enter a valid date for '+c.label);output[c.key]=date}else output[c.key]=s}
 }
 return output;
}
export const starterForms=[{id:'travel-enquiry',title:'Travel enquiry',description:'Tell us about your trip so the ARS team can follow up.',schema:{display:'form',components:[{type:'textfield',key:'travellerName',label:'Traveller name',validate:{required:true}},{type:'email',key:'contactEmail',label:'Contact email',validate:{required:true}},{type:'textfield',key:'destination',label:'Destination',validate:{required:true}},{type:'datetime',key:'departureDate',label:'Preferred departure date'},{type:'number',key:'travellers',label:'Number of travellers',validate:{required:true,min:1,max:100}},{type:'textarea',key:'requirements',label:'Travel requirements'},{type:'checkbox',key:'contactPermission',label:'The ARS team may contact me about this enquiry',validate:{required:true}}]}},{id:'client-details',title:'Client details',description:'Provide contact details for the ARS team.',schema:{display:'form',components:[{type:'textfield',key:'fullName',label:'Full name',validate:{required:true}},{type:'email',key:'email',label:'Email address',validate:{required:true}},{type:'phoneNumber',key:'phone',label:'Phone number'},{type:'textfield',key:'company',label:'Company'},{type:'select',key:'clientType',label:'Client type',data:{values:[{label:'Individual',value:'individual'},{label:'Company',value:'company'}]},validate:{required:true}}]}}];
