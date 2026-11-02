import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequestClient } from './requestClient.js'
import { virtualWindow } from './virtualWindow.js'

test('concurrent identical reads share one fetch and completed reads can refresh', async () => {
  let calls=0,finish
  const request=createRequestClient({fetchImpl:async()=>{calls++;await new Promise(resolve=>{finish=resolve});return {ok:true,json:async()=>({fresh:true})}}})
  const first=request('/list'),second=request('/list')
  assert.equal(first,second);assert.equal(calls,1)
  finish();assert.deepEqual(await first,{fresh:true})
  const next=request('/list');assert.equal(calls,2);finish();await next
})

test('different accounts and filters never share pending requests', async () => {
  let token='first',calls=0
  const request=createRequestClient({getHeaders:()=>({Authorization:token}),fetchImpl:async()=>{calls++;return {ok:true,json:async()=>[]}}})
  const a=request('/users?q=a');token='second'
  await Promise.all([a,request('/users?q=a'),request('/users?q=b')]);assert.equal(calls,3)
})

test('writes are neither coalesced nor retried after a network failure', async () => {
  let calls=0
  const request=createRequestClient({fetchImpl:async()=>{calls++;throw new Error('connection lost')}})
  await Promise.all([assert.rejects(request('/pay',{method:'POST'})),assert.rejects(request('/pay',{method:'POST'}))])
  assert.equal(calls,2)
})

test('HTTP errors release pending reads and never retry', async () => {
  let calls=0
  const request=createRequestClient({fetchImpl:async()=>{calls++;return {ok:false,status:503}}})
  await assert.rejects(request('/list'),error=>error.status===503)
  await assert.rejects(request('/list'),error=>error.status===503)
  assert.equal(calls,2)
})

test('a stalled network is aborted by its deadline', async () => {
  const request=createRequestClient({fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))})
  await assert.rejects(request('/slow',{timeoutMs:5,retries:0}),error=>error.detail.startsWith('Request timeout'))
})

test('a caller cancellation stays separate from an uncancelled shared read', async () => {
  const controller=new AbortController()
  let calls=0
  const request=createRequestClient({fetchImpl:async(_url,{signal})=>{
    calls++
    if(signal.aborted)throw new Error('aborted')
    return {ok:true,json:async()=>({ok:true})}
  }})
  controller.abort()
  await Promise.all([assert.rejects(request('/a',{signal:controller.signal}),error=>error.name==='AbortError'),request('/a')])
  assert.equal(calls,2)
})

test('large ladders stay bounded and preserve full scroll height, including after filtering',()=>{
  for(const top of [0,10000,440000]) {
    const window=virtualWindow(10000,top)
    assert.ok(window.end-window.start<=19)
    assert.equal(window.before+(window.end-window.start)*44+window.after,440000)
  }
  assert.deepEqual(virtualWindow(2,440000),{start:0,end:2,before:0,after:0})
})
