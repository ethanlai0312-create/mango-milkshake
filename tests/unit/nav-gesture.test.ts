import {describe,it,expect} from 'vitest';
import {NavigationPress} from '../../shared/nav-gesture';
import {beginNavigationPress} from '../../src/components/NavItem';
describe('press and slide navigation',()=>{
 it('single click activates once on release',()=>{const p=new NavigationPress();p.start(1,'home');expect(p.finish(1)).toBe('home');expect(p.finish(1)).toBeNull();});
 it('holding never activates and sliding selects the final item',()=>{const p=new NavigationPress();p.start(1,'home');p.move(1,'exams');p.move(1,'create');expect(p.finish(1)).toBe('create');});
 it('release outside or pointer cancellation never navigates',()=>{const p=new NavigationPress();p.start(1,'home');p.move(1,null);expect(p.finish(1)).toBeNull();p.start(2,'exams');expect(p.finish(2,true)).toBeNull();});
 it('another finger cannot steal an active press',()=>{const p=new NavigationPress();expect(p.start(1,'home')).toBe(true);expect(p.start(2,'trash')).toBe(false);expect(p.move(2,'logout')).toBe(false);expect(p.finish(2)).toBeNull();expect(p.finish(1)).toBe('home');});
});

describe('label hold threshold',()=>{
 it('quick clicks never reveal labels but still navigate',()=>{const p=new NavigationPress();p.start(1,'home',1000);expect(p.preview(1,1100)).toBeNull();expect(p.finish(1)).toBe('home');expect(p.preview(1,1300)).toBeNull();});
 it('reveals at 150ms then changes destinations without a second delay',()=>{const p=new NavigationPress();p.start(1,'home',1000);expect(p.preview(1,1149)).toBeNull();expect(p.preview(1,1150)).toBe('home');p.move(1,'exams');expect(p.preview(1,1151)).toBe('exams');});
 it('moving during the wait reveals only the final target and cancel clears it',()=>{const p=new NavigationPress();p.start(1,'home',1000);p.move(1,'exams');expect(p.preview(1,1100)).toBeNull();expect(p.preview(1,1150)).toBe('exams');p.finish(1,true);expect(p.preview(1,1300)).toBeNull();p.start(2,'home',1400);expect(p.preview(2,1450)).toBeNull();});
});

describe('rail scrolling versus holding to select',()=>{
 it('a quick vertical swipe scrolls and never activates a destination',()=>{const p=new NavigationPress();p.start(1,'home',1000,200);expect(p.drag(1,180,1050)).toBe(20);p.move(1,'exams');expect(p.preview(1,1300)).toBeNull();expect(p.finish(1)).toBeNull();});
 it('scrolling continues after the hold threshold and in both directions',()=>{const p=new NavigationPress();p.start(1,'home',1000,200);p.drag(1,180,1050);expect(p.drag(1,100,1300)).toBe(80);expect(p.drag(1,140,1400)).toBe(-40);expect(p.finish(1)).toBeNull();});
 it('an intentional hold keeps slide selection instead of scrolling',()=>{const p=new NavigationPress();p.start(1,'home',1000,200);expect(p.preview(1,1150)).toBe('home');expect(p.drag(1,100,1200)).toBeNull();p.move(1,'exams');expect(p.finish(1)).toBe('exams');});
 it('minor hand movement does not block taps and a new gesture resets scrolling',()=>{const p=new NavigationPress();p.start(1,'home',1000,200);expect(p.drag(1,195,1050)).toBeNull();expect(p.finish(1)).toBe('home');p.start(2,'home',2000,200);p.drag(2,100,2050);p.finish(2);p.start(3,'exams',3000,100);expect(p.preview(3,3150)).toBe('exams');expect(p.finish(3)).toBe('exams');});
});

describe('pressing an existing hover preview',()=>{
 it('keeps the existing preview visible and slides without a second threshold',()=>{const p=new NavigationPress();expect(beginNavigationPress(p,1,'home',1000,200,true)).toBe(true);expect(p.preview(1,1000)).toBe('home');expect(p.drag(1,140,1010)).toBeNull();p.move(1,'exams');expect(p.preview(1,1010)).toBe('exams');expect(p.finish(1)).toBe('exams');expect(p.finish(1)).toBeNull();});
 it('preserves the 150ms threshold and early scrolling when there was no preview',()=>{const p=new NavigationPress();beginNavigationPress(p,1,'home',1000,200,false);expect(p.preview(1,1049)).toBeNull();expect(p.drag(1,180,1050)).toBe(20);expect(p.finish(1)).toBeNull();beginNavigationPress(p,2,'home',2000,200,false);expect(p.preview(2,2149)).toBeNull();expect(p.preview(2,2150)).toBe('home');});
});
