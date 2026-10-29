import {test} from 'node:test';
import assert from 'node:assert/strict';
import {glassSample} from '../shared/glass-optics.mjs';

test('glass refraction is bounded, symmetric and settles before the center of wide/narrow lenses',()=>{
  for(const [w,h,r] of [[1040,128,40],[480,128,40],[160,34,18],[500,700,30]]){
    const center=glassSample(w/2,h/2,w,h,r);
    assert.ok(center.dx===0&&center.dy===0);
    let previous=2;
    for(let d=.5;d<h/2;d+=.5){
      const top=glassSample(w/2,d,w,h,r),bottom=glassSample(w/2,h-d,w,h,r);
      assert.ok(Object.values(top).every(Number.isFinite));
      assert.ok(Math.abs(top.dy)<=1&&top.dy>=0&&top.dy<=previous);
      assert.ok(Math.abs(top.dy+bottom.dy)<1e-9);
      previous=top.dy;
    }
  }
});

test('optical rim matches the CSS superellipse instead of circular corners',()=>{
  const w=1040,h=128,r=40,n=2**1.5;
  const corner=r-r/2**(1/n);
  const onRim=glassSample(corner,corner,w,h,r,n);
  assert.ok(Math.abs(onRim.distance)<1e-8);
  assert.ok(Math.abs(onRim.dx-onRim.dy)<1e-8);
  assert.ok(glassSample(corner,corner,w,h,r,2).distance>2);
  assert.ok(glassSample(corner+3,corner+3,w,h,r,n).distance<0);
});

test('glass has directional rim light and no broad white overlay in its center',()=>{
  assert.equal(glassSample(520,64,1040,128,40).light,0);
  const top=glassSample(520,1,1040,128,40),side=glassSample(1,64,1040,128,40);
  assert.ok(top.light>side.light);
  assert.ok(top.dy>0);
  assert.equal(glassSample(520,30,1040,128,40).dy,0);
});
