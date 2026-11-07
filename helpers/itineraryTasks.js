// The existing board permits trusted HTML; escape every generated/user-derived value.
function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function addItineraryTasks(user,value){
 if(value.todoSync)return value.todoSync;
 const route=[value.plan.origin,value.plan.destination].filter(Boolean).join(' → ');
 const label=[route,value.plan.destinationCity,value.plan.destinationAirport,value.plan.petType,value.plan.departureDate].filter(Boolean).join(' · ');
 const raw=(value.result.timeline||[]).slice(0,25).map(t=>[t.when,t.action].filter(Boolean).join(': '));
 raw.push(...(value.result.questions||[]).slice(0,15).map(q=>'Confirm: '+q));
 raw.push('Find a vet and confirm required travel certificates and appointment timing.');
 if(!user.toDoList)user.toDoList=new Map();
 const seen=new Set([...user.toDoList.values()].flat());const pending=user.toDoList.get('To-Do')||[];let added=0;
 for(const text of raw){if(typeof text!=='string'||!text.trim())continue;const task=escape(label+' — '+text.slice(0,1500));if(!seen.has(task)){pending.push(task);seen.add(task);added++;}}
 user.toDoList.set('To-Do',pending);user.markModified('toDoList');
 value.todoSync={added,at:new Date().toISOString()};return value.todoSync;
}
module.exports={addItineraryTasks};
