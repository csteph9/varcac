import{x as A,n as g,r as f,c as N,a as o,b as s,u as t,e as l,C as B,m as L,d as n,s as _,p as R,t as v,l as w,f as U,h as O,j as z,k as b,i as I}from"./index-CQNOpYTI.js";import{C as x}from"./CAlert-DFnM9774.js";import{C as p}from"./CButton-17-Jpi_Q.js";import{C as j}from"./CCardHeader-BWvtasq5.js";import{C as D}from"./CForm-DvIUpcIO.js";import{C as M}from"./CFormInput-C-0ws8Xw.js";import{C as F}from"./CFormSelect-BzcGRyFc.js";import{C as W,a as C}from"./CRow-48zaJ1dN.js";import{j as $,o as K,T as Z}from"./index-BIoO8FZm.js";import{_ as H}from"./_plugin-vue_export-helper-DlAUqK2U.js";const J={class:"p-3"},P={class:"d-flex justify-content-between align-items-center"},Y={class:"d-flex gap-2"},q={class:"mt-2"},G={class:"d-flex gap-2 mt-4"},Q={__name:"ComputationAdd",setup(X){const E=z(),a=A({name:"",scope:"payout",template:`<%
/*
Your Computation logic goes here.
available functions:
  sum(<SOURCE DATA LABLE>) - return the sum of all values in your data source for the scope defined.
  sum_dr(<SOURCE DATA LABLE>) - used for manager plans. The value return will be based on the data label specified for reps reporting to manager.
  has(<SOURCE DATA LABEL>) - returns true/false if the data exists.
  rollupInfo() - returns a list of participants who report to the managing rep to be included in the payload for debugging.


These data attributes will be included for computation based on plan, participant, and date ranges in scope.

Example:
*/
const sum_of_new_customer_revenue = sum('NEW_CUSTOMER_REVENUE');
const commission_rate = 0.10 //10% of new customer revenue.
const commission_amount = sum_of_new_customer_revenue * commission_rate;
const string_for_debug = "It works!"
%>

<%=
/*
This section returns the computations completed above. Return it with emit_commission()
  emit_commission({
    label: best practice is to give this the same name as the computation
    amount: the commission value calculated above.
    payload: {list of variables from your computation block above that you want to include for debug/review purposes}
  })

  Example:
*/
emit_commission({
  label: 'NEW_REVENUE_COMMISSION',
  amount: commission_amount,
  payload: {string_for_debug, commission_amount, commission_rate, sum_of_new_customer_revenue}
})

%>`}),y=g(()=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(a.name||"")),h=g(()=>!!a.name&&y.value),d=f(!1),i=f(""),r=f(""),T=[$({jsx:!1,typescript:!1}),K],c={autofocus:!1,indentWithTab:!0,tabSize:2};function V(){d.value=!0,i.value="",r.value="";try{window._&&typeof window._.template=="function"&&window._.template(a.template||""),r.value="ok",i.value="Template looks OK."}catch(m){r.value="err",i.value=`Template error: ${(m==null?void 0:m.message)||m}`}finally{d.value=!1}}async function k(){await I.post("/api/computations",{name:a.name,scope:a.scope,template:a.template||null},{withCredentials:!0}),alert("Computation saved!"),E.push({name:"ComputationList"})}function S(){a.name="",a.scope="payout",a.template="",i.value="",r.value=""}return(m,e)=>(b(),N("div",J,[o(t(O),null,{default:s(()=>[o(t(j),{class:"fw-semibold"},{default:s(()=>e[4]||(e[4]=[l("Add Computation",-1)])),_:1,__:[4]}),o(t(B),null,{default:s(()=>[o(t(D),{onSubmit:L(k,["prevent"])},{default:s(()=>[o(t(W),{class:"g-3"},{default:s(()=>[o(t(C),{md:"6"},{default:s(()=>[o(t(_),null,{default:s(()=>e[5]||(e[5]=[l("Name",-1)])),_:1,__:[5]}),o(t(M),{modelValue:a.name,"onUpdate:modelValue":e[0]||(e[0]=u=>a.name=u),placeholder:"RETENTION_BONUS"},null,8,["modelValue"]),n("small",{class:R(y.value?"text-body-secondary":"text-danger")},"Valid JS identifier recommended.",2)]),_:1}),o(t(C),{md:"6"},{default:s(()=>[o(t(_),null,{default:s(()=>e[6]||(e[6]=[l("Scope",-1)])),_:1,__:[6]}),o(t(F),{modelValue:a.scope,"onUpdate:modelValue":e[1]||(e[1]=u=>a.scope=u),options:[{label:"Per payout period",value:"payout"},{label:"Entire plan window",value:"plan"}]},null,8,["modelValue"])]),_:1}),o(t(C),{md:"12"},{default:s(()=>[n("div",P,[o(t(_),{class:"mb-0"},{default:s(()=>e[7]||(e[7]=[l("Lodash Template",-1)])),_:1,__:[7]}),n("div",Y,[o(t(p),{color:"secondary",variant:"outline",size:"sm",onClick:e[2]||(e[2]=u=>a.template=a.template?a.template+`
`:"")},{default:s(()=>e[8]||(e[8]=[l(" Insert example ",-1)])),_:1,__:[8]}),o(t(p),{color:"secondary",size:"sm",disabled:d.value,onClick:V},{default:s(()=>[l(v(d.value?"Validating…":"Validate"),1)]),_:1},8,["disabled"])])]),o(t(Z),{modelValue:a.template,"onUpdate:modelValue":e[3]||(e[3]=u=>a.template=u),extensions:T,autofocus:c.autofocus,"indent-with-tab":c.indentWithTab,"tab-size":c.tabSize,placeholder:"Use Lodash template syntax, e.g. Total: <%= total %> or <% if (x) { %> ... <% } %>",style:{height:"560px",border:"1px solid var(--cui-border-color, #dee2e6)","border-radius":"0.375rem",overflow:"hidden"}},null,8,["modelValue","autofocus","indent-with-tab","tab-size"]),n("div",q,[r.value==="ok"?(b(),w(t(x),{key:0,color:"success",class:"py-2"},{default:s(()=>[l(v(i.value),1)]),_:1})):r.value==="err"?(b(),w(t(x),{key:1,color:"danger",class:"py-2"},{default:s(()=>[l(v(i.value),1)]),_:1})):U("",!0),e[9]||(e[9]=n("small",{class:"text-body-secondary d-block"},[l(" This is a "),n("strong",null,"Lodash template"),l(" (e.g. "),n("code",null,"<%= value %>"),l(", "),n("code",null,"<% if (...) { %>"),l("…). ")],-1))])]),_:1})]),_:1}),n("div",G,[o(t(p),{type:"submit",color:"primary",disabled:!h.value},{default:s(()=>e[10]||(e[10]=[l("Save",-1)])),_:1,__:[10]},8,["disabled"]),o(t(p),{type:"button",color:"secondary",onClick:S},{default:s(()=>e[11]||(e[11]=[l("Reset",-1)])),_:1,__:[11]})])]),_:1})]),_:1})]),_:1})]))}},me=H(Q,[["__scopeId","data-v-46c00f7f"]]);export{me as default};
