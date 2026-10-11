import test from "node:test";
import assert from "node:assert/strict";
import {calculateEstimate,groutKgPerSqm,supervisorDays,type CostArea} from "../lib/estimator";

const area:CostArea={id:1,description:"Floor",sqm:40,sell:100,sub:30,output:20,daysExtra:0,materials:0,mode:"metre",gangDay:600,lengthMm:600,widthMm:600,depthMm:10,jointMm:3,backButter:true};
test("visiting supervisor brackets",()=>{assert.equal(supervisorDays(2),0.5);assert.equal(supervisorDays(5),1);assert.equal(supervisorDays(10),2);assert.equal(supervisorDays(20),4);});
test("grout formula uses geometry",()=>assert.ok(groutKgPerSqm(600,600,10,3,1.6)>0));
test("material packs, back-buttering and supervisor are direct costs",()=>{
 const result=calculateEstimate([area],0,5,30,{adhesiveBagPrice:20,adhesiveCoverage:4,adhesiveBagKg:20,backButterKgPerSqm:2,groutPackPrice:15,groutPackKg:5,groutDensity:1.6,groutWaste:10},{mode:"visiting",dayRate:230,expenses:0});
 assert.equal(result.lines[0].adhesiveBags,14);
 assert.equal(result.supervisorCost,115);
 assert.equal(result.costs,result.labour+result.materials+result.supervisorCost+result.reserve);
 assert.ok(result.required>result.breakEven);
});