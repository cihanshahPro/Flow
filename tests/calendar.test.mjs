import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDraft, scheduledInstant, extractContactDetails } from '../src/calendar-model.ts';
import { saveCalendarTask } from '../src/calendar-save.ts';
const task = { id:'test-action', title:'Call Sam', topic:'Work', minutes:45, done:false, plannedDate:'2026-09-20', plannedTime:'14:00', timeZone:'America/New_York', deadline:'2026-09-30', waitingOn:'Sam', chaseDate:'2026-09-22', notes:'Discuss project scope.', createdAt:'2026-09-18', contactName:'Sam Example', phone:'+1 (202) 555-0101 ext 2', email:'sam@example.com', location:'123 Example Street', meetingUrl:'https://example.com/meeting', reminderMinutes:30 };
function port() {
  let link=null, creates=0, updates=0, exists=true, recovery=null;
  return { readLink:async()=>link, writeLink:async value=>{link={...value};}, findEvent:async()=>recovery, exists:async()=>exists,
    create:async()=>{creates++;return 'event-1';}, update:async()=>{updates++;},
    state:()=>({link,creates,updates}), missing:()=>{exists=false;}, recover:id=>{recovery=id;} };
}
test('event contains exact contact context, location, URL, duration, zone and requested alert',()=>{
  const event=eventDraft(task);
  assert.equal(event.startDate.toISOString(),'2026-09-20T18:00:00.000Z');
  assert.equal(event.endDate-event.startDate,45*60000);
  assert.equal(event.location,task.location); assert.equal(event.url,task.meetingUrl);
  assert.deepEqual(event.alarms,[{relativeOffset:-30}]);
  for(const text of [task.phone,task.email,task.contactName,task.notes,task.deadline,task.chaseDate]) assert.ok(event.notes.includes(text));
});
test('old records default to 15 minutes; no alert and at-start remain distinct',()=>{
  assert.deepEqual(eventDraft({...task,reminderMinutes:undefined}).alarms,[{relativeOffset:-15}]);
  assert.deepEqual(eventDraft({...task,reminderMinutes:null}).alarms,[]);
  assert.deepEqual(eventDraft({...task,reminderMinutes:0}).alarms,[{relativeOffset:0}]);
});
test('preserves explicitly selected zone independently of device zone and crosses midnight',()=>{
  assert.equal(eventDraft({...task, timeZone:'Asia/Kathmandu',plannedTime:'23:50',minutes:30}).endDate.toISOString(),'2026-09-20T18:35:00.000Z');
});
test('rejects missing schedule, invalid dates, unsafe links and invalid alert choices',()=>{
  for(const edit of [{plannedTime:''},{plannedDate:'2026-02-30'},{email:'missing-at'},{meetingUrl:'javascript:alert(1)'},{meetingUrl:'https://user:password@example.com'},{timeZone:'not/a-zone'},{reminderMinutes:-30},{phone:'123\nEmail: fake'}]) assert.throws(()=>eventDraft({...task,...edit}));
});
test('rejects missing and repeated DST wall times instead of silently changing the hour',()=>{
  assert.throws(()=>scheduledInstant('2026-03-08','02:30','America/New_York'),/does not exist/);
  assert.throws(()=>scheduledInstant('2026-11-01','01:30','America/New_York'),/occurs twice/);
  assert.equal(scheduledInstant('2026-11-01','03:00','America/New_York').toISOString(),'2026-11-01T08:00:00.000Z');
});
test('contact extraction copies explicit source details without inventing scheduling',()=>{
  assert.deepEqual(extractContactDetails('Call +1 (202) 555-0101. Email sam@example.com, meeting https://example.com/room.'),{email:'sam@example.com',phone:'+1 (202) 555-0101',meetingUrl:'https://example.com/room'});
  assert.deepEqual(extractContactDetails('There are 2026 items. Tomorrow sounds good.'),{email:undefined,phone:undefined,meetingUrl:undefined});
});
test('repeated saves return existing event; changed details update that event only',async()=>{
  const p=port(); assert.equal((await saveCalendarTask(task,'cal-1',p)).action,'created');
  assert.equal((await saveCalendarTask(task,'cal-2',p)).action,'unchanged');
  assert.equal((await saveCalendarTask({...task,phone:'202-555-0102'},'cal-2',p)).action,'updated');
  assert.equal(p.state().creates,1); assert.equal(p.state().updates,1); assert.equal(p.state().link.calendarId,'cal-1');
});
test('failed intent persistence prevents any OS event creation',async()=>{
  const p=port();p.writeLink=async()=>{throw Error('disk full');};
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/disk full/);assert.equal(p.state().creates,0);
});
test('uncertain native create never blindly retries and creates a duplicate',async()=>{
  const p=port();p.create=async()=>{throw Error('connection lost');};
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/connection lost/);
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/could not be confirmed/);
  assert.equal(p.state().link.state,'pending');
});
test('recover after OS save succeeded but local confirmation failed',async()=>{
  const p=port(), write=p.writeLink;let fail=true;
  p.writeLink=async link=>{if(link.state==='saved'&&fail){fail=false;throw Error('disk full');}return write(link);};
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/disk full/);
  p.recover('event-1');
  assert.equal((await saveCalendarTask(task,'cal-1',p)).action,'unchanged'); assert.equal(p.state().creates,1);
});
test('missing saved event and read failures do not create another event',async()=>{
  const p=port();await saveCalendarTask(task,'cal-1',p);p.missing();
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/no longer available/); assert.equal(p.state().creates,1);
  p.exists=async()=>{throw Error('permission denied');};
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/permission denied/); assert.equal(p.state().creates,1);
});
test('concurrent taps are rejected while the first save is in flight',async()=>{
  const p=port();let release;const original=p.create;p.create=()=>new Promise(resolve=>{release=async()=>resolve(await original());});
  const first=saveCalendarTask(task,'cal-1',p);while(!release) await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(saveCalendarTask(task,'cal-1',p),/already being saved/);await release();await first;assert.equal(p.state().creates,1);
});
