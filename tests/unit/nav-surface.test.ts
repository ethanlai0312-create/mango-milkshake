import {describe,it,expect} from 'vitest';
import {advanceNavigationSpring,navigationContour} from '../../shared/nav-surface';
import {clampNavigationCenter,visibleNavigationCenter} from '../../src/components/NavSurface';
describe('continuous navigation surface',()=>{
 it('keeps the rail and protrusion in one closed shape with stable topology',()=>{const closed=navigationContour(76,0,100,800),open=navigationContour(76,120,300,800);expect(open.match(/[A-Z]/g)).toEqual(closed.match(/[A-Z]/g));expect(open).toContain('M0 0H76');expect(open).toContain('196');expect(open).toMatch(/V800H0Z$/);});
 it('clamps edge curves to the viewport at either end',()=>{expect(navigationContour(76,100,12,100)).not.toContain('-');expect(navigationContour(76,100,94,100)).toMatch(/V100H0Z$/);});
 it('uses a round nose without a straight vertical front face',()=>{const path=navigationContour(76,80,200,800);expect(path.match(/C/g)).toHaveLength(4);expect(path.match(/V/g)).toHaveLength(2);expect(path).toContain('156 200C156');});
 it('retargets from the moving pose without resetting position or velocity',()=>{let pose={value:100,velocity:0};for(let i=0;i<8;i++)pose=advanceNavigationSpring(pose.value,pose.velocity,200,1/60);const before=pose.value;expect(before).toBeGreaterThan(100);expect(before).toBeLessThan(200);const next=advanceNavigationSpring(pose.value,pose.velocity,50,1/60);expect(next.value).not.toBe(100);expect(Math.abs(next.value-before)).toBeLessThan(15);for(let i=0;i<150;i++)pose=advanceNavigationSpring(pose.value,pose.velocity,50,1/60);expect(pose.value).toBeCloseTo(50,2);});
 it('stays finite after a delayed frame',()=>{const pose=advanceNavigationSpring(100,500,300,5);expect(Number.isFinite(pose.value)).toBe(true);expect(pose.value).toBeLessThan(300);});
});

describe('navigation preview visibility',()=>{
 it('dismisses a row once it is completely outside either viewport edge',()=>{expect(visibleNavigationCenter(-44,0,800)).toBeNull();expect(visibleNavigationCenter(800,844,800)).toBeNull();});
 it('keeps partial rows and their shared label inside the same viewport bounds',()=>{expect(visibleNavigationCenter(-36,8,800)).toBe(22);expect(visibleNavigationCenter(788,832,800)).toBe(778);expect(visibleNavigationCenter(100,144,800)).toBe(122);});
 it('uses safe bounds while a resize catches a still-moving spring pose',()=>{expect(clampNavigationCenter(900,400)).toBe(378);expect(clampNavigationCenter(-60,400)).toBe(22);expect(clampNavigationCenter(900,30)).toBe(15);expect(visibleNavigationCenter(0,44,0)).toBeNull();});
});
