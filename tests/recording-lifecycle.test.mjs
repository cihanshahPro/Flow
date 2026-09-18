import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForRecordingForeground} from '../src/recording-lifecycle.ts';
function app(state){const listeners=new Set();return{currentState:state,addEventListener(e,fn){listeners.add(fn);return{remove:()=>listeners.delete(fn)}},change(s){this.currentState=s;for(const fn of listeners)fn(s)},get count(){return listeners.size}}}
test('permission transition resumes only after returning active',async()=>{const a=app('inactive');const p=waitForRecordingForeground(a,()=>false);a.change('active');await p;assert.equal(a.count,0)});
test('background cancels rather than recording without user visibility',async()=>{const a=app('inactive');const p=waitForRecordingForeground(a,()=>false);a.change('background');await assert.rejects(p,/cancelled/);assert.equal(a.count,0)});
test('stuck permission prompt fails visibly and releases listener',async()=>{const a=app(null);await assert.rejects(waitForRecordingForeground(a,()=>false,5),/not ready/);assert.equal(a.count,0)});
