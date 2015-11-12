function Register(_name, _value, _emulator) {
	this.name = _name;
	this.value = _value;
	this.emulator = _emulator;
	this.contents = 0;
}
Register.prototype.getA = Register.prototype.getB = Register.prototype.get = function() { return this.contents; }
Register.prototype.set = function(val) { this.contents = val; }

function RegisterValue(_register) {
	this.register = _register;
	this.emulator = _register.emulator;
}
RegisterValue.prototype.getA = RegisterValue.prototype.getB = RegisterValue.prototype.get = function() { 
	return this.emulator.RAM[this.register.get()] || 0; 
}
RegisterValue.prototype.set = function(val) { 
	this.emulator.RAM[this.register.get()] = val; 
}

function RegisterPlusNextWord(_register) {
	this.register = _register;
	this.emulator = _register.emulator;
	this.cachedResult = null;
}
RegisterPlusNextWord.prototype.getB = RegisterPlusNextWord.prototype.getA = RegisterPlusNextWord.prototype.get = function() { 
	var nw = this.emulator.nextWord();
	if(nw == 0xffff) nw = -1;	// TODO: why is this like this???? (required for '99 bottles' to work...)
	this.cachedResult = this.register.get() + nw;
	return this.emulator.RAM[this.cachedResult] || 0; 
}
RegisterPlusNextWord.prototype.set = function(val) { 
	this.emulator.RAM[this.cachedResult] = val; 
}


function StackPointerValue(_emulator) { 
	this.emulator = _emulator
}
StackPointerValue.prototype.get = StackPointerValue.prototype.getB = function() {
	return this.emulator.Registers.SP.get();
}

StackPointerValue.prototype.getA =  function() {
	return this.emulator.Registers.SP.pop();
}
StackPointerValue.prototype.set = function(val) {
	this.emulator.Registers.SP.push(val);
}

function Literal(_value) {
	this.value = _value;
}
Literal.prototype.getA = Literal.prototype.getB = Literal.prototype.get = function() { return this.value; }
Literal.prototype.set = function(val) {  }
Literals = { };

function Op(_emulator, _name, _value, _cycles, __exec, _set) {
	this.emulator = _emulator;
	this.name = _name;
	this.value = _value;
	this.cycles = _cycles;
	this._exec = __exec;
	_set = _set || this.emulator.OpSet;
	_set[this.value] = this;
}
Op.prototype.exec = function(a, b) { 
	var valA = this.emulator.getParamValue(a);
	var valB = this.emulator.getParamValue(b);
	
	if(!valA) throw new Error("Invalid 'a' value " + a);
	if(!valB) throw new Error("Invalid 'b' value " + b);
	
	this._exec(valA, valB); 
	this.emulator.CPU_CYCLE += this.cycles; 
};

// literals
for(var i = 0x20, literalVal = -1; i < 0x40; i++, literalVal++) {
	Literals["L_" + literalVal] = i;
}

// convenience constants
Values = { };
Values.REGISTER_VALUE_OFFSET = 0x08;
Values.REGISTER_NEXT_WORD_OFFSET = 0x10;
Values.SP_OFFSET = 0x18;
Values.NEXT_WORD_VALUE = 0x1e;
Values.NEXT_WORD_LITERAL = 0x1f;
Values.SP = 0x1b;
Values.PC = 0x1c;
Values.EX = 0x1d;

REGISTER_A = 0x00;
REGISTER_B = 0x01;
REGISTER_C = 0x02;
REGISTER_X = 0x03;
REGISTER_Y = 0x04;
REGISTER_Z = 0x05;
REGISTER_I = 0x06;
REGISTER_J = 0x07;
REGISTER_SP = 0x1b;
REGISTER_PC = 0x1c;
REGISTER_EX = 0x1d;

OPERATION_SET = 0x01;
OPERATION_ADD = 0x02;
OPERATION_SUB = 0x03;
OPERATION_MUL = 0x04;
OPERATION_MLI = 0x05;
OPERATION_DIV = 0x06;
OPERATION_DVI = 0x07;
OPERATION_MOD = 0x08;
OPERATION_MDI = 0x09;
OPERATION_AND = 0x0a;
OPERATION_BOR = 0x0b;
OPERATION_XOR = 0x0c;
OPERATION_SHR = 0x0d;
OPERATION_ASR = 0x0e;
OPERATION_SHL = 0x0f;

OPERATION_IFB = 0x10;
OPERATION_IFC = 0x11;
OPERATION_IFE = 0x12;
OPERATION_IFN = 0x13;
OPERATION_IFG = 0x14;
OPERATION_IFA = 0x15;
OPERATION_IFL = 0x16;
OPERATION_IFU = 0x17;

OPERATION_ADX = 0x1a;
OPERATION_SBX = 0x1b;

OPERATION_STI = 0x1e;
OPERATION_STD = 0x1f;

OPERATION_JSR = 0x01;
OPERATION_INT = 0x08;
OPERATION_IAG = 0x09;
OPERATION_IAS = 0x0a;
OPERATION_RFI = 0x0b;
OPERATION_IAQ = 0x0c;

OPERATION_HWN = 0x10;
OPERATION_HWQ = 0x11;
OPERATION_HWI = 0x12;



Utils = { 
	to32BitSigned: function(val) {
		if((val & 0x8000) > 0) {
			return (((~val) + 1) & 0xffff) * -1;	// two's complement
		}
		return val;
	},
	
	to16BitSigned: function(val) {
		if(val < 0) {
			//return ((~val) + 1) & 0xffff;	// two's complement
			return ((val & 0x7fff) | 0x8000);
		}
		return val & 0xffff;
	},
	
	byteTo32BitSigned: function(val) {
		if((val & 0x80) > 0) {
			return (((~val) + 1) & 0xff) * -1;	// two's complement
		}
		return val;
	},
	
	roundTowardsZero: function(val) {
		if(val < 0)
			val = Math.ceil(val);
		else
			val = Math.floor(val);
		return val;
	},
	
	makeInstruction: function(opcode, a, b) {
		var instruction = opcode;
		instruction |= (b << 5);
		instruction |= (a << 10);
		return instruction;
	},
	
	makeSpecialInstruction: function(opcode, a) {
		var instruction = 0;
		instruction |= (a << 10);
		instruction |= (opcode << 5);
		return instruction;
	},
	
	parseInstruction: function(instruction) {
		return { 
			opcode: instruction & 0x001f,
			b: (instruction & 0x03e0) >> 5,
			a: (instruction & 0xfc00) >> 10
		}
	},
	
	parseSpecialInstruction: function(instruction) {
		return { 
			a: (instruction & 0xfc00) >> 10,
			opcode: (instruction & 0x03e0) >> 5,
			b: 0
		}
	},
	
	hex: function(num) {
		return "0x" + Utils.to16BitSigned(num).toString(16);
	},
	
	hex2: function(num) {
		//var str = Utils.to16BitSigned(num).toString(16);
		var str = (num).toString(16);
		return "0x" + "0000".substr(str.length) + str;
	},
	
	makeVideoCell: function(glyph, blink, bg, fg) {
		var result = glyph & 0x7f;
		result |= (blink & 0x1) << 7;
		result |= (bg & 0xf) << 8;
		result |= (fg & 0xf) << 12;
		return result;
	},
	
	color16To32: function(c) {
		var r = (((c & 0xf00) >> 8) * 16) << 16;
		var g = (((c & 0x0f0) >> 4) * 16) << 8;
		var b = (c & 0x00f) * 16;
		return Utils.makeColor(r | g | b);
		
	},
	
	makeColor: function(d) {
		var hex = Number(d).toString(16);
		hex = "000000".substr(0, 6 - hex.length) + hex; 
		return "#" + hex;
	},
	
	createImage: function(src) {
		var img = new Image();
		img.src = src;
		return img;
	}

};

Speeds = {
	"100 kHz": { "delayFrequency": 1000, "delayTime": 1 },
	"10 kHz": { "delayFrequency": 50, "delayTime": 1 },
	"1 kHz": { "delayFrequency": 10, "delayTime": 10 },
	"100 Hz": { "delayFrequency": 10, "delayTime": 100 },
	"10 Hz": { "delayFrequency": 1, "delayTime": 100 },
};

/**
 * Emulator constructor.
 *
 * @constructor
 * @this {Emulator}
 */
function Emulator() { 

	this.async = true;
	this.verbose = false;
	this.currentSpeed = Speeds["100 kHz"];

	this.CPU_CYCLE = 0;
	this.RAM = [];

	this.OpSet = { };
	this.SpecialOpSet = { };
	this.Registers = { 
		A: new Register("A", REGISTER_A, this),
		B: new Register("B", REGISTER_B, this),
		C: new Register("C", REGISTER_C, this),
		X: new Register("X", REGISTER_X, this),
		Y: new Register("Y", REGISTER_Y, this),
		Z: new Register("Z", REGISTER_Z, this),
		I: new Register("I", REGISTER_I, this),
		J: new Register("J", REGISTER_J, this),
		SP: new Register("SP", REGISTER_SP, this),
		PC: new Register("PC", REGISTER_PC, this),
		EX: new Register("EX", REGISTER_EX, this),
		IA: new Register("IA", 0xffff, this),
	};


	this.Registers.PC.inc = function() {
		var v = this.get();
		this.set(v+1);
		return v;
	};
	this.PC = this.Registers.PC;

	this.Registers.SP.push = function(val) {
		this.contents =  Utils.to16BitSigned(this.contents - 1);
		this.emulator.RAM[this.contents] = val;
	};
	this.Registers.SP.pop = function() {
		if(this.contents == 0) 
			console.log("Warning: stack underflow");
			
		var val = this.emulator.RAM[this.contents] || 0;
		this.emulator.RAM[this.contents] = 0;	// TODO: should the emualtor alter the memory location when it is POPed?
		this.contents = (this.contents + 1) & 0xffff;
		return val;
	};

	
	this.Values = { }
	this.Values[0x00] = this.Registers.A;
	this.Values[0x01] = this.Registers.B;
	this.Values[0x02] = this.Registers.C;
	this.Values[0x03] = this.Registers.X;
	this.Values[0x04] = this.Registers.Y;
	this.Values[0x05] = this.Registers.Z;
	this.Values[0x06] = this.Registers.I;
	this.Values[0x07] = this.Registers.J;
	this.Values[0x08] = new RegisterValue(this.Registers.A);
	this.Values[0x09] = new RegisterValue(this.Registers.B);
	this.Values[0x0a] = new RegisterValue(this.Registers.C);
	this.Values[0x0b] = new RegisterValue(this.Registers.X);
	this.Values[0x0c] = new RegisterValue(this.Registers.Y);
	this.Values[0x0d] = new RegisterValue(this.Registers.Z);
	this.Values[0x0e] = new RegisterValue(this.Registers.I);
	this.Values[0x0f] = new RegisterValue(this.Registers.J);
	this.Values[0x10] = new RegisterPlusNextWord(this.Registers.A);
	this.Values[0x11] = new RegisterPlusNextWord(this.Registers.B);
	this.Values[0x12] = new RegisterPlusNextWord(this.Registers.C);
	this.Values[0x13] = new RegisterPlusNextWord(this.Registers.X);
	this.Values[0x14] = new RegisterPlusNextWord(this.Registers.Y);
	this.Values[0x15] = new RegisterPlusNextWord(this.Registers.Z);
	this.Values[0x16] = new RegisterPlusNextWord(this.Registers.I);
	this.Values[0x17] = new RegisterPlusNextWord(this.Registers.J);
	this.Values[0x18] = new StackPointerValue(this);
	this.Values[0x19] = new RegisterValue(this.Registers.SP);
	this.Values[0x1a] = new RegisterPlusNextWord(this.Registers.SP);
	this.Values[0x1b] = this.Registers.SP;
	this.Values[0x1c] = this.Registers.PC;
	this.Values[0x1d] = this.Registers.EX;
	this.Values[0x1e] = { // next word value
		emulator: this,
		getA: function() { return this.get(); },
		getB: function() { return this.get(); },
		get: function() { 
			this.cachedResult = this.emulator.nextWord();
			return this.emulator.RAM[this.cachedResult] || 0; 
		},
		set: function(val) { 
			this.emulator.RAM[this.cachedResult] = val; 
		}
	};	
	this.Values[0x1f] = { // next word literal	
		emulator: this,
		getA: function() { return this.get(); },
		getB: function() { return this.get(); },
		get: function() { return this.emulator.nextWord(); },
		set: function(val) { }
	};
	
	this.Values[0x20] = new Literal(0xffff);	// -1
	for(var i = 0x21, literalVal = 0; i < 0x40; i++, literalVal++) {
		this.Values[i] = new Literal(literalVal);
	}


	this.BasicOperations = {
		SET: new Op(this, "SET", OPERATION_SET, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(aVal);
			
			// TODO: some applications assume that setting PC to itself should terminate the application
			//if(a == this.emulator.Registers.PC && b == this.emulator.Registers.PC) {
			//	this.emulator.Registers.PC.contents = Number.MAX_VALUE;
			//}
		}),
		
		ADD: new Op(this, "ADD", OPERATION_ADD, 2, function(a, b) { 
			var res = a.getA() + b.getB();
			if((res & 0xffff0000) > 0)
				this.emulator.Registers.EX.set(0x0001);
			else
				this.emulator.Registers.EX.set(0);
			b.set(res & 0xffff);
		}),
		
		SUB: new Op(this, "SUB", OPERATION_SUB, 2, function(a, b) { 
			var aVal = a.getA();
			var res = b.getB() - aVal;
			if((res) < 0)
				this.emulator.Registers.EX.set(0xffff);
			else
				this.emulator.Registers.EX.set(0);
			b.set(res & 0xffff);
			
		}),
		
		MUL: new Op(this, "MUL", OPERATION_MUL, 2, function(a, b) { 
			var res = a.getA() * b.getB();
			this.emulator.Registers.EX.set((res >> 16) & 0xffff);
			b.set(res & 0xffff);
		}),
		
		MLI: new Op(this, "MLI", OPERATION_MLI, 2, function(a, b) { 
			var aVal = Utils.to32BitSigned(a.getA()), bVal = Utils.to32BitSigned(b.getB());
			var res = bVal * aVal;
			this.emulator.Registers.EX.set((res >> 16) & 0xffff);
			b.set(Utils.to16BitSigned(res));
		}),
		
		DIV: new Op(this, "DIV", OPERATION_DIV, 3, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(aVal === 0) {
				this.emulator.Registers.EX.set(0);
				b.set(0);
			}
			else {			
				var res = Math.floor(bVal / aVal);
				this.emulator.Registers.EX.set(Math.floor(((bVal << 16) / aVal)) & 0xffff);
				b.set(res & 0xffff);
			}
		}),
		
		DVI: new Op(this, "DVI", OPERATION_DVI, 3, function(a, b) { 
			var aVal = Utils.to32BitSigned(a.getA()), bVal = Utils.to32BitSigned(b.getB());
			if(aVal === 0) {
				this.emulator.Registers.EX.set(0);
				b.set(0);
			}
			else {			
				var res = Utils.roundTowardsZero(bVal / aVal);
				this.emulator.Registers.EX.set(Utils.roundTowardsZero(((bVal << 16) / aVal)) & 0xffff);
				b.set(Utils.to16BitSigned(res));
			}
		}),
		
		MOD: new Op(this, "MOD", OPERATION_MOD, 3, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(aVal === 0)
				b.set(0);
			else 
				b.set(bVal % aVal);
		}),
		
		MDI: new Op(this, "MDI", OPERATION_MDI, 3, function(a, b) { 
			var aVal = Utils.to32BitSigned(a.getA()), bVal = Utils.to32BitSigned(b.getB());
			if(aVal === 0)
				b.set(0);
			else 
				b.set(Utils.to16BitSigned(bVal % aVal));
		}),
		
		AND: new Op(this, "AND", OPERATION_AND, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(bVal & aVal);
		}),
		
		BOR: new Op(this, "BOR", OPERATION_BOR, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(bVal | aVal);
		}),
		
		XOR: new Op(this, "XOR", OPERATION_XOR, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(bVal ^ aVal);
		}),
		
		SHR: new Op(this, "SHR", OPERATION_SHR, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			this.emulator.Registers.EX.set(((bVal << 16 ) >> aVal) & 0xffff);
			b.set(bVal >>> aVal);
		}),
		
		ASR: new Op(this, "ASR", OPERATION_ASR, 1, function(a, b) { 
			var aVal = a.getA(), bVal = Utils.to32BitSigned(b.getB());
			this.emulator.Registers.EX.set(((bVal << 16) >>> aVal) & 0xffff);
			b.set((bVal >> aVal) & 0xffff);
		}),
		
		SHL: new Op(this, "SHL", OPERATION_SHL, 1, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			this.emulator.Registers.EX.set(((bVal << aVal) >> 16) & 0xffff);
			b.set((bVal << aVal) & 0xffff);
		}),
		
		IFB: new Op(this, "IFB", OPERATION_IFB, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if((bVal & aVal) != 0) { }
			else this.emulator.skipInstruction();
			
		}),
		
		IFC: new Op(this, "IFC", OPERATION_IFC, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if((bVal & aVal) === 0) { }
			else this.emulator.skipInstruction();
			
		}),
		
		IFE: new Op(this, "IFE", OPERATION_IFE, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(bVal === aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		IFN: new Op(this, "IFN", OPERATION_IFN, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(bVal !== aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		IFG: new Op(this, "IFG", OPERATION_IFG, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(bVal > aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		IFA: new Op(this, "IFA", OPERATION_IFA, 2, function(a, b) { 
			var aVal = Utils.to32BitSigned(a.getA()), bVal = Utils.to32BitSigned(b.getB());
			if(bVal > aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		IFL: new Op(this, "IFL", OPERATION_IFL, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			if(bVal < aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		IFU: new Op(this, "IFU", OPERATION_IFU, 2, function(a, b) { 
			var aVal = Utils.to32BitSigned(a.getA()), bVal = Utils.to32BitSigned(b.getB());
			if(bVal < aVal) { }
			else this.emulator.skipInstruction();
		}),
		
		
		ADX: new Op(this, "ADX", OPERATION_ADX, 3, function(a, b) { 
			var res = a.getA() + b.getB() + this.emulator.Registers.EX.get();
			this.emulator.Registers.EX.set(res > 0xffff ? 1 : 0);
			b.set(res & 0xffff);
		}),
		
		SBX: new Op(this, "SBX", OPERATION_SBX, 3, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			var res = bVal - aVal + this.emulator.Registers.EX.get();
			this.emulator.Registers.EX.set(res < 0 ? 0xffff : 0);
			b.set(res & 0xffff);
		}),
		
		STI: new Op(this, "STI", OPERATION_STI, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(aVal);
			//a.set(bVal);
			this.emulator.Registers.I.set((this.emulator.Registers.I.get() + 1) &  0xffff);
			this.emulator.Registers.J.set((this.emulator.Registers.J.get() + 1) &  0xffff);
		}),
		
		STD: new Op(this, "STD", OPERATION_STD, 2, function(a, b) { 
			var aVal = a.getA(), bVal = b.getB();
			b.set(aVal);
			//a.set(bVal);
			this.emulator.Registers.I.set((this.emulator.Registers.I.get() - 1) &  0xffff);
			this.emulator.Registers.J.set((this.emulator.Registers.J.get() - 1) &  0xffff);
		}),
		
		JSR: new Op(this, "JSR", OPERATION_JSR, 3, function(a) { 
			var aVal = a.getA();
			this.emulator.Registers.SP.push(this.emulator.Registers.PC.get());
			this.emulator.Registers.PC.set(aVal);
		}, this.SpecialOpSet),
		
		INT: new Op(this, "INT", OPERATION_INT, 4, function(a) { 
			var aVal = a.getA();
			this.emulator.interruptQueue.push(aVal);
		}, this.SpecialOpSet),
		
		IAG: new Op(this, "IAG", OPERATION_IAG, 1, function(a) { 
			var aVal = a.getA();
			a.set(this.emulator.Registers.IA.get());
		}, this.SpecialOpSet),
		
		IAS: new Op(this, "IAS", OPERATION_IAS, 1, function(a) { 
			this.emulator.Registers.IA.set(a.getA());
		}, this.SpecialOpSet),
		
		RFI: new Op(this, "RFI", OPERATION_RFI, 3, function(a) { 
			var aVal = a.getA();
			this.emulator.interruptQueueingEnabled = false;
			this.emulator.Registers.A.set(this.emulator.Registers.SP.pop());
			this.emulator.Registers.PC.set(this.emulator.Registers.SP.pop());
			
		}, this.SpecialOpSet),
		
		IAQ: new Op(this, "IAQ", OPERATION_IAQ, 2, function(a) { 
			var aVal = a.getA();
			if(aVal === 0)
				this.emulator.interruptQueueingEnabled = false;
			else
				this.emulator.interruptQueueingEnabled = true;
		}, this.SpecialOpSet),
		
		HWN: new Op(this, "HWN", OPERATION_HWN, 2, function(a) { 
			var aVal = a.getA();
			a.set(this.emulator.devices.length);
		}, this.SpecialOpSet),
		
		HWQ: new Op(this, "HWQ", OPERATION_HWQ, 4, function(a) { 
			var dev = this.emulator.devices[a.getA()];
			if(dev) {
				this.emulator.Registers.A.set(dev.id & 0xffff);
				this.emulator.Registers.B.set((dev.id >> 16) & 0xffff);
				this.emulator.Registers.C.set(dev.version & 0xffff);
				this.emulator.Registers.X.set(dev.manufacturer & 0xffff);
				this.emulator.Registers.Y.set((dev.manufacturer >> 16) & 0xffff);
			}
			
		}, this.SpecialOpSet),
		
		HWI: new Op(this, "HWI", OPERATION_HWI, 4, function(a) { 
			var dev = this.emulator.devices[a.getA()];
			if(dev)
				dev.interrupt();
		}, this.SpecialOpSet),
	};


	this.boot= function() {
		console.log("--- DCPU-16 Emulator ---");
	
		this.program =  null;
		this.PC.set(0);
		this.CPU_CYCLE = 0;
		this.RAM = new Array(0x10000);
		this.asyncSteps = 1;
		
		this.interruptQueueingEnabled = false;
		this.interruptQueue = [];
		
		for(var r in this.Registers) {
			this.Registers[r].set(0);
		}
		//this.Registers.SP.set(0xffff);
		
		for(var i = 0; i < this.devices.length; i++) {
			this.devices[i].init();
		}
	};
	
	this.reboot= function() { this.boot(); };

	/**
	 * Run the program specified.  
	 * @ _program the program you want to run, as an array of bytes.
	 */
	this.run = function(_program) {
		this.program = _program;
		
		console.log("Running program (" + this.program.length + " words)" );
		
		// load program into RAM
		for(var i = 0; i < this.program.length; i++) {
			if(this.program[i] != undefined)
				this.RAM[i] = this.program[i];
		}
		
		if(!this.async) {
			while(this.step()) { }
			this.exit();
		}
		else
			this.stepAsync();
		
	};
	
	this.step = function() {
		if(this.PC.get() < this.program.length) {
			this.nextInstruction();
			
			if(this.attachedDebugger && this.paused)
				this.attachedDebugger.onStep(this.PC.get());
			
			// process one interrupt if we have one
			if(this.interruptQueueingEnabled == false && this.interruptQueue.length > 0) {
				this.processInterrupt(this.interruptQueue.pop());
			}
			
			return true;
		}
		else return false;
	};
	
	var _this = this;
	this.paused = false;
	
	this.runAsync = function() {
		while(true) {
			if(Math.floor(_this.CPU_CYCLE / _this.currentSpeed.delayFrequency) > _this.asyncSteps) {
				_this.asyncSteps++;
				setTimeout(_this.runAsync, _this.currentSpeed.delayTime);
				break;
			}
			else {
				if(!_this.stepAsync())
					break;
			}
		}
	}
	
	this.stepAsync = function() {
		if(this.program == null)	// break if we have rebooted
			return false;
		
		if(this.paused) {
			if(this.attachedDebugger) {
				this.attachedDebugger.onPaused(this.PC.get());
				return false;
			}
		}
		else {
			if(this.attachedDebugger) {
				if(this.attachedDebugger.breakpoints[""+this.PC.get()]) {
					this.paused = true;
					this.attachedDebugger.onPaused(this.PC.get());
					return false;
				}
			}
		
			var res = this.step();
			if(!res)
				this.exit();
			return res;
			
		}	
	};
	
	this.nextInstruction = function() {
		var data = this.RAM[this.PC.inc()];
		var instruction = Utils.parseInstruction(data);
		var op; 
		if(instruction.opcode === 0) {
			instruction = Utils.parseSpecialInstruction(data);
			op = this.SpecialOpSet[instruction.opcode];
		}
		else
			op = this.OpSet[instruction.opcode];
		
		
		
		if(!op) {
			var err = "Invalid opcode " + instruction.opcode;
			console.warn(err);
			throw err;
		}
		
		if(this.verbose) {
			console.log(
				Utils.hex(this.Registers.PC.get()) + "\t" + 
				op.name + "\t(" + 
				Utils.hex(instruction.a) + ",\t" + 
				Utils.hex(instruction.b) + ")"
			);
		}
		op.exec(instruction.a, instruction.b);
		
		if(this.attachedDebugger)
			this.attachedDebugger.onInstruction(this.PC.get());
	};
	
	this.nextWord = function() {
		this.CPU_CYCLE++;
		return this.RAM[this.Registers.PC.inc()];
	};
	
	this.getParamValue = function(val) {
		return this.Values[new String(val)];
	};
	
	this.skipInstruction = function() {
		var instruction = Utils.parseInstruction(this.RAM[this.PC.inc()]);
		this.CPU_CYCLE++;
		
		// skip "next word" values by invoking get() on the params
		this.getParamValue(instruction.a).get();
		if(instruction.opcode != 0)
			this.getParamValue(instruction.b).get();
		
		if(instruction.opcode >= OPERATION_IFB && instruction.opcode <= OPERATION_IFU) {
			// if we have skipped a conditional instruction, skip additional instruction 
			// at cost of an additional cycle.  continue until a non-conditional instruction
			// has been skipped
			this.skipInstruction();
		}
		
	};
	
	this.processInterrupt = function(message) {
		if(this.Registers.IA.get() != 0) {
			this.interruptQueueingEnabled = true;
			this.Registers.SP.push(this.Registers.PC.get());	// push PC onto the stack
			this.Registers.SP.push(this.Registers.A.get());		// followed by pusing A to the stack
			this.Registers.PC.set(this.Registers.IA.get());		// set PC to IA
			this.Registers.A.set(message);						// set A to the interrupt message
		}
		else {
		}
	};
	
	this.interrupt = function(message) {
		this.interruptQueue.push(message);
		
		if(this.interruptQueue.length > 256) {
			// catch fire?
			console.warn("DCUP-16 is on fire");
			throw "Too many interrupts";
		}
	};
	
	this.exit = function() {
		console.log("Program completed in " + this.CPU_CYCLE + " cycles");
		
		if(this.attachedDebugger)
			this.attachedDebugger.onExit();
	};
	
	this.attachedDebugger = null;
	this.attachDebugger = function(_debugger) {
		this.attachedDebugger = _debugger;
	};
	
	this.setSpeed = function(newSpeed) {
		var speed = Speeds[newSpeed];
		if(!speed) { 
			console.log("invalid speed " + newSpeed); 
			return; 
		}
		emulator.currentSpeed = speed;
		emulator.asyncSteps = emulator.CPU_CYCLE / emulator.currentSpeed.delayFrequency;
	}
	
	this.devices = [];
	
	this.boot();
};

// generic device used for unit tests
function Device(_id, _version, _manufacturer, _emulator) {
	this.id = _id;
	this.version = _version;
	this.manufacturer = _manufacturer;
	this.emulator = _emulator;
};
Device.prototype.interrupt = function() { };
Device.prototype.init = function() { };


function Debugger(_emulator) {
	if(!_emulator.async) throw "Emulator must be in asynchronous mode to use a debugger with it.";
	this.emulator = _emulator;
	this.breakpoints = {};
	
	this.emulator.attachDebugger(this);
}
Debugger.prototype.getBreakpoints = function() {
	return this.breakpoints;
};
Debugger.prototype.toggleBreakpoint = function(location, lineNumber) {
	location += "";	// convert to string
	if(this.breakpoints[location])
		delete this.breakpoints[location];
	else
		this.breakpoints[location] = lineNumber;
};
Debugger.prototype.run = function() { 
	if(this.emulator.paused) {
		this.emulator.paused = false;
		this.emulator.runAsync();
	}
};
Debugger.prototype.step = function() { 
	if(this.emulator.paused) {
		if(!this.emulator.step())
			this.emulator.exit();
	}
};
Debugger.prototype.pause = function() { 
	this.emulator.paused = true;
};

// events
Debugger.prototype.onStep = function(location) { };
Debugger.prototype.onPaused = function(location) { };
Debugger.prototype.onInstruction = function(location) { };
Debugger.prototype.onExit = function() { };


Tokenizer = {

	tokens: [
		{ pattern: /^(;.*)/,						type: "comment"			},
		{ pattern: /^([\.#](include|incbin|def|define|equ|undef|dw|dp|fill|ascii|org|macro|end|rep|if|elif|elseif|else|ifdef|ifndef|error|align|echo).*)/,
													type: "preprocessor"	},
		{ pattern: /^\b(0x[0-9ABCDEF]+)\b/i,		type: "hexidecimal"		},
		{ pattern: /^\b(0b[0-1]+)\b/i,				type: "binary"			},
		{ pattern: /^\b([0-9]+)\b/,					type: "decimal"			},
		{ pattern: /^(\".*\")/,						type: "string"			},
		{ pattern: /^(:[0-9A-Za-z_\.]+)/,			type: "label_def"		},
		{ pattern: /^([0-9A-Za-z_\.]+:)/,			type: "label_def"		},
		{ pattern: /^\b(POP|PUSH|PEEK|PICK|DAT)\b/i,type: "reserved_word"	},		
		{ pattern: /^\b(SET|ADD|SUB|MUL|MLI|DIV|DVI|MOD|MDI|AND|BOR|XOR|SHR|ASR|SHL|IFB|IFC|IFE|IFN|IFG|IFA|IFL|IFU|ADX|SBX|STI|STD|JSR|INT|IAG|IAS|RFI|IAQ|HWN|HWQ|HWI)\b/i,
													type: "command"			},
		{ pattern: /^\b([ABCXYZIJ]|SP|PC|EX)\b/i,	type: "register"		},
		{ pattern: /^([0-9A-Za-z_\.]+)/,			type: "label_ref"		},
		{ pattern: /^(\[)/,							type: "open_bracket"	},
		{ pattern: /^(\])/,							type: "close_bracket"	},		
		{ pattern: /^(,)/,							type: "comma"			},
		{ pattern: /^(\+|\-|\*|\/|%|\(|\)|\&|\||\^|>>|<<|~|\^)/,		
													type: "operator"		},
		{ pattern: /^([\s]+)/,						type: "space" 			},
	],
	
	preprocessorTokens: [
		{ pattern: /^\b(include|incbin|def|define|equ|undef|dw|dp|fill|ascii|org|macro|end|rep|if|elif|elseif|else|ifdef|ifndef|error|align|echo)\b/i,
													type: "directive"		},
		{ pattern: /^\b(0x[0-9ABCDEF]+)\b/i,		type: "hexidecimal"		},
		{ pattern: /^\b([0-9]+)\b/,					type: "decimal"			},
		{ pattern: /^(\".*\")/,						type: "string"			},
		{ pattern: /^\b([0-9A-Za-z_\.]+)\b/,		type: "identifier"		},	
		{ pattern: /^(,)/,							type: "comma"			},
		{ pattern: /^(\+|\-|\*|\/|%|\(|\)|\&|\||\^|>>|<<|~|\^)/,		
													type: "operator"		},
		{ pattern: /^([\s]+)/,						type: "space" 			},
		{ pattern: /^(<|>)/,						type: "bracket"			},
	],
	
	tokenize: function(input) {
		
		var lines = input.split("\n");
		var tokenizedLines = [];
		var errors = [];
		for(var i = 0; i < lines.length; i++) {
			var line = lines[i];
			var tokenizedLine = [];
			
			try {
				while(line != null && line.length > 0) {
					
					//console.log("tokenizing ", line);
					
					var lexeme = null;
					var match = null;
					var token = null;
				
					for(var p = 0; p < this.tokens.length; p++) {
						token = this.tokens[p];
						match = token.pattern.exec(line);
						if(match) break;
					}
				
					if(match && match[1].length > 0) {
						//console.log("token", match);
						
						lexeme = match[1];
						if(token.type == "command" || token.type == "reserved_word" || token.type == "register")
							lexeme = lexeme.toUpperCase();
							
						tokenizedLine.push( new Token(lexeme, token.type) );
						
						line = line.substr(lexeme.length);
					}
					else {
						throw { 
							name: "AssemblyError", 
							message: "Invalid token near " + line,
							line: (i+1)
						};
						line = null;
					}
				}
			}
			catch(err) { 
				errors.push(err);
				console.log(err);
			}
			
			tokenizedLines.push(tokenizedLine);
		}
		return { lines: tokenizedLines, errors: errors };
	},
	
	htmlFormatTokens: function(tokenizedLines) {
		var html = "";
		for(var i = 0; i < tokenizedLines.length; i++) {
			var tokenizedLine = tokenizedLines[i];
			for(var j = 0; j < tokenizedLine.length; j++) {
				var token = tokenizedLine[j];
				html += this.htmlFormatToken(token);
			}
			html += "<br/>";
		}
		return html;
	},
	
	htmlFormatToken: function(token) {
		var str = token.lexeme.replace(/ /g, "&nbsp;");
		return "<span class='" + token.type + "'>" + str + "</span>";
	},
	
	logTokens: function(tokens, start) {
		var str = "";
		for(var l = start; l < tokens.length; l++) {
			str += tokens[l].lexeme;
		}
		console.log(str);
	}
}

function Token(lexeme, type) {
	this.lexeme = lexeme;
	this.type = type;
	
	this.isNumericLiteral = function() { 
		return (this.type === "decimal" || this.type === "hexidecimal" || this.type === "binary");
	}
}

function AssemblerArgument() {
	this.expressionValue = null;
	this.expressionRegister = null;
	this.memoryTarget = false;
	this.value = null;
	this.nextWord = null;
	this.tokenCount = 0;
}

Preprocessor = { 
	preprocess: function(input, filesForIncludes) {
		filesForIncludes = filesForIncludes || {};
		var messages = [];
		var errors = [];
		var lineMap = {};
		var totalLines = 0;
		
		// split and tokenize lines
		var lines = input.split("\n");
		var tokenizedLines = [];
		
		for(var i = 0; i < lines.length; i++) {
			var line = lines[i];
			if(line.length == 0)
				tokenizedLines.push([ new Token("", "general") ]);
			
			for(var j = 0; j < line.length; j++) {
				if(line[j] == ';') {
					// comment line
					tokenizedLines.push([ new Token(line, "general") ]);
					break;
				}
				else if(line[j] == '#' || line[j] == '.') {
					var start = line[j];
				
					// tokenize preprocessor directive
					try {
						tokenizedLines.push(this.tokenizeLine(line.substr(line.indexOf(start)+1), i));
					}
					catch(err) {
						console.log(err);
						errors.push(err);
					}
					break;
				}
				else { 
					// not a preprocessor directive
					tokenizedLines.push([ new Token(line, "general") ]);
					break;
				}
			}
		}
		
		var defines = {};
		var conditionals = [];
		var output = "";
		
		// process directives on each line
		for(var i = 0; i < tokenizedLines.length; i++) {
			
			var directive = null;
			var define = null;
			var includeInOutput = true;
			
			for(var j = 0; j < tokenizedLines[i].length; j++) {
				var token = tokenizedLines[i][j];
				
				if(token.type == "directive") {
					directive = token.lexeme;
				}
				else if(token.type == "general") {				
					// replace preprocessor defines in non-preprocessor commands
					for(var key in defines) {
						var regex = new RegExp("\\b" + key + "\\b", "g");
						token.lexeme = token.lexeme.replace(regex, defines[key]);
					}
					
				}
			}
			
			for(var j = 0; j < conditionals.length; j++) {
				// omit lines from output inside failed conditionals
				if(!conditionals[j]) {
					includeInOutput = false;
					break;
				}
			}
			
			if(directive != null) {
			
				var replaceAfter = 0;
				
				// these directives will have a first argument that we do not want to substitute for its 
				// defined value
				if(directive == "def" || directive == "define" || directive == "equ" || directive == "undef"
					|| directive == "ifdef" || directive == "ifndef") {
					replaceAfter = 1;
				}
				
				
				var args;
				try {
					args = this.getArguments(tokenizedLines[i], 1, i+1, defines, replaceAfter);
				} catch(e) {
					errors.push(e);
				}
				
				if(directive == "end") {
					if(conditionals.length > 0)
						conditionals.pop();
					else
						errors.push({ name: "PreprocessorError", message: "Unexpected 'end'", line: (i+1) });
				}
				else if(directive == "else") {
					if(conditionals.length > 0) 
						conditionals.push(!conditionals.pop());
					else
						errors.push({ name: "PreprocessorError", message: "Unexpected 'else'", line: (i+1) });
				}
				else if(directive == "if") {
					if(args.length > 0) {
						if(typeof args[0] == "string")
							conditionals.push(false);
						else conditionals.push(args[0]);
					}
					else
						errors.push({ name: "PreprocessorError", message: "Invalid if expression", line: (i+1) });
				}
				else if(directive == "ifdef" || directive == "ifndef") {
					var next = args.length > 0 ? args[0] : null;
					if(next)
						conditionals.push( (directive == "ifdef") ? defines[next] != null : defines[next] == null );
					else
						errors.push({ name: "PreprocessorError", message: "Invalid " + directive, line: (i+1) });
				}
				else if(directive == "elif" || directive == "elseif") {
					// TODO: this is wrong
					var cond;
					if(conditionals.length > 0)
						cond = conditionals.pop();
					else
						errors.push({ name: "PreprocessorError", message: "Unexpected '"+directive+"'", line: (i+1) });
						
					if(args.length > 0) {
						if(cond || typeof args[0] == "string")
							conditionals.push(false);
						else conditionals.push(args[0]);
					}
					else
						errors.push({ name: "PreprocessorError", message: "Invalid "+directive+" expression", line: (i+1) });
				}
				
				
				if(includeInOutput) {
					if(directive == "echo" || directive == "error") {
						if(args.length > 0) {
							var msg = (typeof args[0] == "string") ? removeQuotes(args[0]) : args[0];
							console.log(msg);
							if(directive == "echo")
								messages.push(msg);
							else
								errors.push({ name: "error", message: msg, line: (i+1) });
						}
					}
					else if(directive == "def" || directive == "define" || directive == "equ") {
						
						// TODO: this doesn't allow previously defined identifiers to be re-defined
						
						if(args.length > 0)
							defines[args[0]] = args.length > 1 ? args[1] : 1;
						else
							errors.push({ name: "PreprocessorError", message: "Invalid " + directive, line: (i+1) });
					}
					else if(directive == "undef") {
						// TODO: this doesn't work because the identifier has already been replaced
					
						if(args.length > 0)
							delete defines[args[0]];
						else
							errors.push({ name: "PreprocessorError", message: "Invalid undef", line: (i+1) });
					}
					// we'll deal with these when creating the bytecode
					else if(directive == "org" || directive == "dw" || directive == "dp" || directive == "fill") { 
					}	
					// we've already handled conditionals
					else if(directive == "if" || directive == "else" || directive == "elif" || directive == "elseif" 
						|| directive == "end" || directive == "ifdef" || directive == "ifndef" || directive == "include") { }	
					else
						errors.push({ name: "PreprocessorError", message: "Sorry, this preprocessor doesn't support '" + directive + "'", line: (i+1) });
					
				}
			}
			
			// reconstruct the program from each line
			for(var j = 0; j < tokenizedLines[i].length; j++) {
				if(!includeInOutput) continue;
				
				var token = tokenizedLines[i][j];
				
				if(token.type == "directive" && token.lexeme == "include") {
					
					try {
						var includeArgs = this.getArguments(tokenizedLines[i], 1, i+1, defines, 0);
						if(includeArgs.length == 1 && typeof includeArgs[0] == "string") {
							// actually include the file, and preprocess it as well
							var filename = includeArgs[0];
							var quotes = /\"(.*)\"/;
							filename = filename.match(quotes) ? filename.match(quotes)[1] : filename;
							var file = filesForIncludes[filename];
							if(file) {
								var includeOutput = Preprocessor.preprocess(file, filesForIncludes);
								
								messages.concat(includeOutput.messages);
								errors.concat(includeOutput.errors);
								output += includeOutput.output;
								totalLines += includeOutput.output.split("\n").length - 1;
							}
							else
								errors.push({ name: "PreprocessorError", message: "File not found: " + includeArgs[0], line: (i+1) });
						}
						else {
							errors.push({ name: "PreprocessorError", message: "Invalid include", line: (i+1) });
						}
					} catch(e) {
						errors.push(e);
					}
					
					break;
				}
				else {
					if(token.type == "directive")
						output += ".";
					output += token.lexeme;
				}
			}
			output += "\n";
			lineMap[i] = totalLines;
			totalLines++;
		}
		
		if(conditionals.length > 0)
			errors.push({ name: "PreprocessorError", message: "Expected '.end'", line: tokenizedLines.length });
			

		
		//console.log(output)
		
		return { output: output, messages: messages, errors: errors, lineMap: lineMap };
	},
	
	tokenizeLine: function(line, i) {
		var tokenizedLine = [];
			
		while(line != null && line.length > 0) {
			
			//console.log("tokenizing ", line);
			
			var lexeme = null;
			var match = null;
			var token = null;
		
			for(var p = 0; p < Tokenizer.preprocessorTokens.length; p++) {
				token = Tokenizer.preprocessorTokens[p];
				match = token.pattern.exec(line);
				if(match) break;
			}
		
			if(match && match[1].length > 0) {
				//console.log("token", match);
				
				lexeme = match[1];
				if(token.type == "directive")
					lexeme = lexeme.toLowerCase();
				tokenizedLine.push( new Token(lexeme, token.type) );
				
				line = line.substr(lexeme.length);
			}
			else {
				throw { 
					name: "PreprocessorError", 
					message: "Invalid token near " + line,
					line: (i+1)
				};
				line = null;
			}
		}
		return tokenizedLine;
	},
	
	getArguments: function(tokens, start, lineNumber, defines, replaceAfter) {
		var args = [];
		var j;
		
		// indicates how many arguments to *NOT* perform identifier substitutions on
		replaceAfter = replaceAfter || 0; 
		var skipCount = 0;
		
		for(j = start; j < tokens.length; j++) {
			if(tokens[j].type == "space" || tokens[j].type == "bracket" || tokens[j].type == "directive"  || tokens[j].type == "comma")
				continue;
				
			if(tokens[j].type == "identifier" && skipCount >= replaceAfter) {
				tokens[j] = this.replaceIdentifier(tokens[j], defines);
			}
			else
				skipCount++;
		}

		for(j = start; j < tokens.length; j++) {
			if(tokens[j].type == "space" || tokens[j].type == "bracket" || tokens[j].type == "directive"  || tokens[j].type == "comma")
				continue;
				
			var t;
			if(tokens[j].type == "identifier")
				t = tokens[j];
			else {
				tokens = Assembler.evaluateExpression(tokens, j, lineNumber, {});
				t = tokens[j];
			}
				
			if(t.isNumericLiteral())
				args.push(parseNumericLiteral(t.lexeme));
			else
				args.push(t.lexeme);
			
		}
		
		return args;
	},
	
	org: function(preLine, line) {
		var org = Preprocessor.nextNonSpace(preLine, 1);
		if(org != null && org.isNumericLiteral()) {
			var orgVal = parseNumericLiteral(org.lexeme);
			if(orgVal >= 0 && orgVal <= 0xffff)
				return orgVal;
			else this.throwInvalid(line+1, null, "Invalid use of .org");
		}
		else {
			this.throwInvalid(line+1, null, "Invalid use of .org");
		}
	},
	
	nextNonSpace: function(ary, start) {
		for(var i = start; i < ary.length; i++) {
			if(ary[i].type != "space")
				return ary[i];
		}
	},
	
	replaceIdentifier: function(token, defines) {
		
		if(defines[token.lexeme]) {
			var val = defines[token.lexeme];
			return new Token(val, (typeof val == "string") ? "string" : "decimal");
		}
		else return token;
	}
}

Assembler =  {
	getLabelValue: function(token, labels, lineNumber) {
		if(labels != null) {
			var labelVal = labels[token.lexeme.toLowerCase()];
			if(labelVal == null) this.throwInvalid(lineNumber, token, "Undefined label " + token.lexeme);
			return labelVal;
		}
		else return 0x100; // placeholder -- TODO: what if this gets reduced to a literal next time through?
		
	},
	
	getRegisterValue: function(register, value, valuePlusNextWord) { 
		var val = eval("REGISTER_" + register);
		
		if(register != "SP") {
			if(value) 
				val += Values.REGISTER_VALUE_OFFSET;
			if(valuePlusNextWord) 
				val += Values.REGISTER_NEXT_WORD_OFFSET;
		}
		else {
			if(value)
				val = Values.SP_OFFSET + 1;	// 0x19
			if(valuePlusNextWord)
				val = Values.SP_OFFSET + 2;	// 0x1a
		}
		return val;
		
	},

	evaluateExpression: function(tokens, start, lineNumber, labels) {
		var k;
		var expressionStr = "";
		var expressionStart = -1, expressionEnd = 0xffffff;
		
		
		// build string representation of the expression.  only works if all operands are literals
		for(k = start; k < tokens.length; k++) {
			var token = tokens[k];
			
			if(token.type === "space") { 
				continue;
			}
			else if(token.type == "comma" || token.type == "comment" || token.type == "preprocessor") { 
				break;
			}
			else if(token.type === "register") {
				expressionStr = "";	// can't evalute expressions containing variables
				break;
			}
			else if(token.type === "operator") {
				expressionStr += token.lexeme;
			}
			else if(token.type === "label_ref") {
				expressionStr += this.getLabelValue(token, labels, lineNumber);
			}
			else if(token.isNumericLiteral()) {
				expressionStr += parseNumericLiteral(token.lexeme);
			}
			else {
				continue;
			}
			
			if(expressionStart === -1)
				expressionStart = k;
			expressionEnd = k;
		}
		
		if(expressionStr.length > 0 && expressionStart != expressionEnd) {
		
			// duplicate token array so we can modify it
			var dupe = [];
			for(k = 0; k < tokens.length; k++) {
				dupe.push(tokens[k]);
			}
			tokens = dupe;
		
			// evaluate the expression
			var expressionResult;
			try {
				expressionResult = eval(expressionStr) & 0xffff;
			}
			catch(e) {
				this.throwInvalid(lineNumber, null, "Invalid expression near " + tokens[expressionStart].lexeme);
			}
			
			// put the result back in the token array as a numeric literal
			var newToken = new Token(expressionResult, "decimal");
			tokens.splice(expressionStart, expressionEnd-expressionStart+1, newToken);
		}
		return tokens;
	},

	compileArgument: function(tokens, start, lineNumber, labels, argumentIndex) {
		var argument = new AssemblerArgument();
		var k;
		var openBracketCount = 0, closeBracketCount = 0, netBracketCount = 0;
		var lastOperator = null;
		var originalLength = tokens.length;
		
		tokens = this.evaluateExpression(tokens, start, lineNumber, labels);
		
		for(k = start; k < tokens.length; k++) {
			var token = tokens[k];
			
			if(token.type == "space") { }
			else if(token.type == "comma" || token.type == "comment" || token.type == "preprocessor") { 
				break;
			}
			else if(token.isNumericLiteral() || token.type == "label_ref") {
				if(argument.expressionRegister != null && argument.expressionValue != null) this.throwInvalid(lineNumber, token);
				
				var val;
				if(token.type == "label_ref") {
					val = this.getLabelValue(token, labels, lineNumber);
				}
				else val = parseNumericLiteral(token.lexeme);
				
				if(lastOperator != null && argument.expressionValue != null) {
					this.throwInvalid(lineNumber, token);
				}
				else argument.expressionValue = val;
				
				if(argument.memoryTarget) {
					if(argument.expressionRegister != null) {
						if(lastOperator == null) this.throwInvalid(lineNumber, token, "Missing operator");
						if(lastOperator != "+") this.throwInvalid(lineNumber, token, "The " + lastOperator + " operator can not be used when referencing a register");
						if(argument.expressionRegister == "PC") this.throwInvalid(lineNumber, token, "DCPU-16 does not allow addressing relative to PC");
						
						argument.value = this.getRegisterValue(argument.expressionRegister, false, true);
						argument.nextWord = argument.expressionValue;
						lastOperator = null;
					}
					else {
						argument.value  = Values.NEXT_WORD_VALUE;
						argument.nextWord = argument.expressionValue;
					}
				}
				else {
					if(argument.expressionRegister != null && lastOperator != null) this.throwInvalid(lineNumber, token, "Expressions can not contain registers unless using 'register plus next word'.");
				
					// literal
					var val32 = Utils.to32BitSigned(argument.expressionValue);
					
					// we can use the "shorthand" literal representation only if this is an 'a' value and
					// not a label reference
					if(val32 >= -1 && val32 <= 30 && token.type != "label_ref" && argumentIndex > 0) {
						argument.value = Literals["L_"+val32];
						argument.nextWord = null;
					}
					else {
						argument.value = Values.NEXT_WORD_LITERAL;
						argument.nextWord = argument.expressionValue;
					}
				}
			}
			else if(token.type == "register") {
				if(argument.expressionValue == null) {
					argument.value = this.getRegisterValue(token.lexeme, argument.memoryTarget, false);
					argument.expressionRegister = token.lexeme;
				}
				else {
					if(!argument.memoryTarget) this.throwInvalid(lineNumber, token);
					if(argument.expressionRegister) this.throwInvalid(lineNumber, token);
					if(lastOperator != "+") this.throwInvalid(lineNumber, token);
					
					argument.value = this.getRegisterValue(token.lexeme, false, true);
					argument.nextWord = argument.expressionValue;
					argument.expressionRegister = token.lexeme;
					lastOperator = null;
				}
			}
			else if(token.type == "reserved_word" && token.lexeme != "DAT") {
				if(argument.expressionValue != null || lastOperator != null) this.throwInvalid(lineNumber, token);
				
				if(token.lexeme == "POP")
					argument.value = Values.SP_OFFSET;
				else if(token.lexeme == "PUSH")
					argument.value = Values.SP_OFFSET;
				else if(token.lexeme == "PEEK")
					argument.value = Values.SP_OFFSET + 1;
				else if(token.lexeme == "PICK")
					argument.value = Values.SP_OFFSET + 2;
			}
			else if(token.type == "open_bracket") {
				argument.memoryTarget = true;
				openBracketCount++;
				netBracketCount++;
				if(netBracketCount > 1) this.throwInvalid(lineNumber, null, "Unexpected [");
			}
			else if(token.type == "close_bracket") {
				if(lastOperator != null) this.throwInvalid(lineNumber, token);
				closeBracketCount++;
				netBracketCount--;
				if(netBracketCount < 0) this.throwInvalid(lineNumber, null, "Unexpected ]");
			}
			else if(token.type == "operator") {
				if(lastOperator != null) this.throwInvalid(lineNumber, token);
				lastOperator = token.lexeme;
			}
			else {
				this.throwInvalid(lineNumber, token);
			}
		}
		
		if(openBracketCount != closeBracketCount) this.throwInvalid(lineNumber, null, "Mismatched brackets");
		
		argument.tokenCount = k - start + (originalLength - tokens.length);
		return argument;
	},
	
	compile: function(tokenizedLines) {
		
		var offset = 0;
		var output = new Listing();
		var errorMap = {};
		var argumentCount = 0;
	
		// perform a first pass to estimate the offset associated with each label
		for(var i = 0; i < tokenizedLines.length; i++) {
			var line = tokenizedLines[i];
			
			var command = null;
			var dat = null;
			argumentCount = 0;
			
			try {
			
				for(var j = 0; j < line.length; j++) {
					var token = line[j];
					
					// handle initial operation
					if(command == null && dat == null) {
						if(token.type == "space" || token.type == "comment") { }
						
						else if(token.type == "preprocessor") {
							// handle preprocessor .org
							var preLine = Preprocessor.tokenizeLine(token.lexeme.substr(1), i);
							var directive = preLine[0].lexeme;
							if(directive == "org") {
								offset = Preprocessor.org(preLine, i);
							}
						}
						
						else if(token.type == "command") {
							command = token;
							offset++;
						}
						else if(token.type == "label_def") {
							var labelName = token.lexeme.substr(1).toLowerCase();
							if(output.labels[labelName] != null) this.throwInvalid(j, token, "Duplicate label definition (" + labelName + ")");
							
							output.labels[labelName] = offset;
						}
						else if(token.type == "reserved_word" && token.lexeme == "DAT") {
							dat = token;
						}
						else {
							this.throwInvalid(i+1, token);
						}
					}
					// handle arguments
					else {
						if(command != null) {
							var arg = this.compileArgument(line, j, i+1, null, argumentCount);
							argumentCount++;
							if(arg.nextWord != null) 
								offset++;
							j += arg.tokenCount;
						}
						else if(dat != null) {
							// data blocks
							if(token.isNumericLiteral()) {
								offset++;
							}
							else if(token.type == "label_ref") {
								offset++;
							}
							else if(token.type == "string") {
								var str = removeQuotes(token.lexeme);
								offset += str.length;
							}
              else if(token.type == "command" || token.type == "reserved_word"){
                this.throwInvalid(i+1, token, "Invalid value to use in a data block: " + token.lexeme);
              }
						}
					}
				}
			}
			catch(e) {
				output.errors.push(e);
				errorMap[""+i] = e;
			}
		}
		
		offset = 0;
		
		// perform second pass to generate bytecode
		for(var i = 0; i < tokenizedLines.length; i++) {
			var line = tokenizedLines[i];
		
			// skip line if there is an error on it
			if(errorMap[""+i]) {
				output.addLine(offset, line, []);
				continue;
			}	

			var opcode = 0;
			var command = null;
			var arguments = [];
			var dat = null;
			var bytes = [];
			argumentCount = 0;
			
			try {
				for(var j = 0; j < line.length; j++) {
					var token = line[j];
					
					// handle initial operation
					if(command == null && dat == null) {
						if(token.type == "space" || token.type == "comment") { }
						else if(token.type == "preprocessor") {
							// handle preprocessor data insertion and .org
							var preLine = Preprocessor.tokenizeLine(token.lexeme.substr(1), i);
							var directive = preLine[0].lexeme;
							if(directive == "org") {
								offset = Preprocessor.org(preLine, i);
							}
							else if(directive == "dw") {
								dat = Preprocessor.getArguments(preLine, 1, j+1, {});
							}
							else if(directive == "dp") {
								dat = [];
								var dpIdx = 1;	// first value goes in high octet, so start at 1 and decrement to 0
								var dpVal = 0;
								var args = Preprocessor.getArguments(preLine, 1, j+1, {});
								
								for(var k = 0; k < args.length; k++) {
									dpVal |= args[k] << (dpIdx*8);
									if(dpIdx == 0) {
										dat.push(dpVal);
										dpIdx = 1;
										dpVal = 0;
									}
									else
										dpIdx--;
									
								}
								// in case there were an odd number of values
								if(dpIdx == 0)
									dat.push(dpVal);
							}
							else if(directive == "fill") {
								dat = [];
								var args = Preprocessor.getArguments(preLine, 1, j+1, {});
								var fillCount = args[0];
								var fillValue = args.length > 1 ? args[1] : 0;
								
								for(var k = 0; k < fillCount; k++) {
									dat.push(fillValue);
								}
							}
						}
						else if(token.type == "command") {
							command = token;
							opcode = eval("OPERATION_"+token.lexeme);
						}
						else if(token.type == "label_def") { }
						else if(token.type == "reserved_word" && token.lexeme == "DAT") {
							dat = [];
						}
						else {
							this.throwInvalid(i+1, token);
						}
					}
					// handle arguments
					else {
						if(command != null) {
							var arg = this.compileArgument(line, j, i+1, output.labels, argumentCount);
							argumentCount++;
							if(arg.value != null)
								arguments.push(arg);
							j += arg.tokenCount;
						}
						else if(dat != null) {
							// data blocks
							if(token.isNumericLiteral()) {
								dat.push(parseNumericLiteral(token.lexeme));
							}
							else if(token.type == "label_ref") {
								dat.push(this.getLabelValue(token, output.labels, i+1));
							}
							else if(token.type == "string") {
								var str = removeQuotes(token.lexeme);

								// push each character onto the program array
								for(var c = 0; c < str.length; c++) {
									dat.push(parseInt(str.charCodeAt(c)));
								}
							}
						}
					}
				}
				
				if(opcode != 0) {
					if(arguments.length == 0) 
						this.throwInvalid(i+1, null, "One or more parameters are required");
					if(arguments.length > 2) 
						this.throwInvalid(i+1, null, "Too many arguments");
					
					
					var param1 = arguments[0];
					var param2 = (arguments.length > 1) ? arguments[1] : { };
					
					//additionalInstructions
					
					if(arguments.length == 1) 
						bytes.push(Utils.makeSpecialInstruction(opcode, param1.value));
					else {
						bytes.push(Utils.makeInstruction(opcode, param2.value, param1.value));
					}
					
					if(param2.nextWord != null)
						bytes.push(param2.nextWord);
					
					if(param1.nextWord != null)
						bytes.push(param1.nextWord);
					
				}
				else if(dat != null) {
					for(var k = 0; k < dat.length; k++) {
						bytes.push(dat[k]);
					}
				}
			}
			catch(e) { 
				output.errors.push(e);
			}
			
			output.addLine(offset, line, bytes);
			offset += bytes.length;
			
		}
		
		return output;
		
	},
	
	compileSource: function(source, filesForIncludes) {
		var preOutput = Preprocessor.preprocess(source, filesForIncludes);
		var tokenized = Tokenizer.tokenize(preOutput.output);
		var _listing = this.compile(tokenized.lines);
		_listing.errors = preOutput.errors.concat(tokenized.errors, _listing.errors);
		_listing.messages = preOutput.messages.concat(_listing.messages);
		_listing.lineMap = preOutput.lineMap;
		return _listing;
	},
	
	throwInvalid: function(line, token, message) {
		message = message || ("Invalid syntax on line " + line + " near " + token.lexeme);
		console.log(message);
		throw { 
			name: "AssemblyError", 
			message: message,
			line: line
		};
	}
}

function Listing() {
	this.lines = [];
	this.errors = [];
	this.messages = [];
	this.labels = {};

	this.addLine = function(offset, tokens, bytecode) {
		this.lines.push({ "offset": offset, "tokens": tokens, "bytecode": bytecode });
	}
	
	this.bytecode = function() {
		var output = [];
		for(var i = 0; i < this.lines.length; i++) {
			for(var j = 0; j < this.lines[i].bytecode.length; j++) {
				output[this.lines[i].offset+j] = this.lines[i].bytecode[j];
			}
		}
		return output;
	}
	
	this.htmlFormat = function() {
		var html = "";
		
		for(var i = 0; i < this.lines.length; i++) {
			var line = this.lines[i];
			html += "<div class='listing_line'>";
			html += "<span class='offset' id='offset_line_"+i+"'>" + Utils.hex2(line.offset) + "</span>";
			
			html += "<span class='tokens'>";
			for(var j = 0; j < line.tokens.length; j++) {
				html += Tokenizer.htmlFormatToken(line.tokens[j]);
			}
			html += "</span>";
			
			html += "</div>";
		}
		
		return html;
	}
	
	this.bytecodeText = function() {	
		var bytecode = this.bytecode();
		var output = "";
		for(var i = 0; i < bytecode.length; i++) {
			output += Utils.hex2(bytecode[i] || 0) + " ";
		}
		return output;
	}
}

function AssemblyError(message, line) {
    this.name = "AssemblyError";
    this.message = (message || "");
	this.line = line;
}
AssemblyError.prototype = Error.prototype;

function parseNumericLiteral(val) {
	if(val.toString().indexOf("0b") === 0)
		return parseInt(val.substr(2), 2);
	else if(val.toString().indexOf("0x") === 0)
		return parseInt(val);
	else
		return parseInt(val, 10);
}

function removeQuotes(str) {
	if(str.length > 2)
		return str.substr(1, str.length-2);
	return str;
}

module.exports = Assembler;
