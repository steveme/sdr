import * as usb from "../usb"

/**
 * Initial values for registers 0x05-0x1f.
 */
const REGISTERS = [0x83, 0x32, 0x75, 0xc0, 0x40, 0xd6, 0x6c, 0xf5, 0x63, 0x75,
    0x68, 0x6c, 0x83, 0x80, 0x00, 0x0f, 0x00, 0xc0, 0x30, 0x48,
    0xcc, 0x60, 0x00, 0x54, 0xae, 0x4a, 0xc0];

/**
 * Configurations for the multiplexer in different frequency bands.
 */
const MUX_CFGS = [
    [0, 0x08, 0x02, 0xdf],
    [50, 0x08, 0x02, 0xbe],
    [55, 0x08, 0x02, 0x8b],
    [60, 0x08, 0x02, 0x7b],
    [65, 0x08, 0x02, 0x69],
    [70, 0x08, 0x02, 0x58],
    [75, 0x00, 0x02, 0x44],
    [90, 0x00, 0x02, 0x34],
    [110, 0x00, 0x02, 0x24],
    [140, 0x00, 0x02, 0x14],
    [180, 0x00, 0x02, 0x13],
    [250, 0x00, 0x02, 0x11],
    [280, 0x00, 0x02, 0x00],
    [310, 0x00, 0x41, 0x00],
    [588, 0x00, 0x40, 0x00]
];

/**
 * A bit mask to reverse the bits in a byte.
 */
const BIT_REVS = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe,
    0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];

/**
 * Checks if the R820T tuner is present.
 * @param {RtlCom} com The RTL communications object.
 * @return {boolean} A boolean that tells whether the tuner is present.
 */
export async function checkR820T(device: USBDevice) {
    var data = await usb.readI2CRegister(device, 0x34, 0);
    return (data == 0x69);
};

/**
 * State / Operations on the R820T tuner chip.
 */
export type R820TState = {
    /**
     * The USB Device
     */
    device: USBDevice
    /**
     * The Frequency of the oscillator crystal
     */
    xtalFreq: number
    /**
     * Whether the PLL in the tuner is locked.
     */
    hasPllLock: boolean
    /**
     * Shadow registers 0x05-0x1f, for setting values using masks.
     */
    shadowRegs?: Uint8Array
}

export function create(device: USBDevice, xtalFreq: number): R820TState {
    return {
        device,
        xtalFreq,
        hasPllLock: false,
        shadowRegs: undefined
    }
}

export async function init(state: R820TState) {
    await initRegisters(state)
    await initElectronics(state)
}

/**
 * Sets the initial values of the 0x05-0x1f registers.
 * @param {Array.<number>} regs The values for the registers.
 */
async function initRegisters(state: R820TState) {
    state.shadowRegs = new Uint8Array(REGISTERS);
    var cmds         = [];
    for (var i = 0; i < REGISTERS.length; ++i) {
        cmds.push([usb.CMD.I2CREG, 0x34, i + 5, REGISTERS[i]]);
    }
    await writeEach(state, cmds);
}

/**
 * Initializes all the components of the tuner.
 */
async function initElectronics(state: R820TState) {
    await writeEach(state, [
        [0x0c, 0x00, 0x0f],
        [0x13, 49, 0x3f],
        [0x1d, 0x00, 0x38]
    ]);
    var filterCap = await calibrateFilter(state, true);
    console.log("filterCap", filterCap)
    if(filterCap === undefined) {
        throw new Error("filterCap not defined, filter not calibrated");
    }
    await writeEach(state, [
        [0x0a, 0x10 | filterCap, 0x1f],
        [0x0b, 0x6b, 0xef],
        [0x07, 0x00, 0x80],
        [0x06, 0x10, 0x30],
        [0x1e, 0x40, 0x60],
        [0x05, 0x00, 0x80],
        [0x1f, 0x00, 0x80],
        [0x0f, 0x00, 0x80],
        [0x19, 0x60, 0x60],
        [0x1d, 0xe5, 0xc7],
        [0x1c, 0x24, 0xf8],
        [0x0d, 0x53, 0xff],
        [0x0e, 0x75, 0xff],
        [0x05, 0x00, 0x60],
        [0x06, 0x00, 0x08],
        [0x11, 0x38, 0x08],
        [0x17, 0x30, 0x30],
        [0x0a, 0x40, 0x60],
        [0x1d, 0x00, 0x38],
        [0x1c, 0x00, 0x04],
        [0x06, 0x00, 0x40],
        [0x1a, 0x30, 0x30],
        [0x1d, 0x18, 0x38],
        [0x1c, 0x24, 0x04],
        [0x1e, 0x0d, 0x1f],
        [0x1a, 0x20, 0x30]
    ]);
}

/**
 * Writes a masked value into a register.
 * @param state
 * @param {number} addr The address of the register to write into.
 * @param {number} value The value to write.
 * @param {number} mask A mask that specifies which bits to write.
 */
async function writeRegMask(state: R820TState, addr: number, value: number, mask: number) {
    if (!state.shadowRegs) {
        throw new Error("Shadow registers not initialised");
    }
    var rc                     = state.shadowRegs[addr - 5];
    var val                    = (rc & ~mask) | (value & mask);
    state.shadowRegs[addr - 5] = val;
    await usb.writeI2CRegister(state.device, 0x34, addr, val);
}

/**
 * Perform the write operations given in the array.
 * @param {Array.<Array.<number>>} array The operations.
 */
async function writeEach(state: R820TState, arr: Array<Array<number>>) {
    for (var index = 0; index < arr.length; index++) {
        var line = arr[index];
        await writeRegMask(state, line[0], line[1], line[2]);
    }
}

/**
 * Sets the tuner's frequency.
 * @param {number} freq The frequency to tune to.
 * @return {number} The actual tuned frequency.
 */
export async function setFrequency(state: R820TState, freq: number) {
    await setMux(state, freq);
    return await setPll(state, freq);
}

/**
 * Stops the tuner.
 */
export async function close(state: R820TState) {
    await writeEach(state, [
        [0x06, 0xb1, 0xff],
        [0x05, 0xb3, 0xff],
        [0x07, 0x3a, 0xff],
        [0x08, 0x40, 0xff],
        [0x09, 0xc0, 0xff],
        [0x0a, 0x36, 0xff],
        [0x0c, 0x35, 0xff],
        [0x0f, 0x68, 0xff],
        [0x11, 0x03, 0xff],
        [0x17, 0xf4, 0xff],
        [0x19, 0x0c, 0xff]
    ]);
}


/**
 * Sets the tuner to automatic gain.
 */
export async function setAutoGain(state: R820TState) {
    await writeEach(state, [
        [0x05, 0x00, 0x10],
        [0x07, 0x10, 0x10],
        [0x0c, 0x0b, 0x9f]
    ]);
}

/**
 * Sets the tuner's manual gain.
 * @param state
 * @param {number} gain The tuner's gain, in dB.
 */
export async function setManualGain(state: R820TState, gain: number) {
    var step = 0;
    if (gain <= 15) {
        step = Math.round(1.36 + gain * (1.1118 + gain * (-0.0786 + gain * 0.0027)));
    } else {
        step = Math.round(1.2068 + gain * (0.6875 + gain * (-0.01011 + gain * 0.0001587)));
    }
    if (step < 0) {
        step = 0;
    } else if (step > 30) {
        step = 30;
    }
    var lnaValue   = Math.floor(step / 2);
    var mixerValue = Math.floor((step - 1) / 2);
    await writeEach(state, [
        [0x05, 0x10, 0x10],
        [0x07, 0x00, 0x10],
        [0x0c, 0x08, 0x9f],
        [0x05, lnaValue, 0x0f],
        [0x07, mixerValue, 0x0f]
    ]);
}

/**
 * Calibrates the filters.
 * @param state
 * @param {boolean} firstTry Whether this is the first try to calibrate.
 */
async function calibrateFilter(state: R820TState, firstTry: boolean): Promise<number | undefined> {
    await writeEach(state, [
        [0x0b, 0x6b, 0x60],
        [0x0f, 0x04, 0x04],
        [0x10, 0x00, 0x03]
    ]);
    await setPll(state, 56000000);
    if (!state.hasPllLock) {
        throw new Error("PLL not locked -- cannot tune to the selected frequency.");
    }
    await writeEach(state, [
        [0x0b, 0x10, 0x10],
        [0x0b, 0x00, 0x10],
        [0x0f, 0x00, 0x04]
    ]);
    var data      = await readRegBuffer(state, 0x00, 5);
    var arr       = new Uint8Array(data);
    var filterCap = arr[4] & 0x0f;
    if (filterCap == 0x0f) {
        filterCap = 0;
    }
    if (filterCap != 0 && firstTry) {
        return await calibrateFilter(state, false);
    } else {
        return (filterCap);
    }
}

/**
 * Sets the multiplexer's frequency.
 * @param {number} freq The frequency to set.
 */
async function setMux(state: R820TState, freq: number) {
    var freqMhz = freq / 1000000;
    for (var i = 0; i < MUX_CFGS.length - 1; ++i) {
        if (freqMhz < MUX_CFGS[i + 1][0]) {
            break;
        }
    }
    var cfg = MUX_CFGS[i];
    await writeEach(state, [
        [0x17, cfg[1], 0x08],
        [0x1a, cfg[2], 0xc3],
        [0x1b, cfg[3], 0xff],
        [0x10, 0x00, 0x0b],
        [0x08, 0x00, 0x3f],
        [0x09, 0x00, 0x3f]
    ]);
}

/**
 * Sets the PLL's frequency.
 * @param {number} freq The frequency to set.
 */
async function setPll(state: R820TState, freq: number) {
    var pllRef = Math.floor(state.xtalFreq);
    await writeEach(state, [
        [0x10, 0x00, 0x10],
        [0x1a, 0x00, 0x0c],
        [0x12, 0x80, 0xe0]
    ]);
    var divNum      = Math.min(6, Math.floor(Math.log(1770000000 / freq) / Math.LN2));
    var mixDiv      = 1 << (divNum + 1);
    var data        = await readRegBuffer(state, 0x00, 5);
    var arr         = new Uint8Array(data);
    var vcoFineTune = (arr[4] & 0x30) >> 4;
    if (vcoFineTune > 2) {
        --divNum;
    } else if (vcoFineTune < 2) {
        ++divNum;
    }
    await writeRegMask(state, 0x10, divNum << 5, 0xe0);
    var vcoFreq = freq * mixDiv;
    var nint    = Math.floor(vcoFreq / (2 * pllRef));
    var vcoFra  = vcoFreq % (2 * pllRef);
    if (nint > 63) {
        state.hasPllLock = false;
        return;
    }
    var ni = Math.floor((nint - 13) / 4);
    var si = (nint - 13) % 4;
    await writeEach(state, [
        [0x14, ni + (si << 6), 0xff],
        [0x12, vcoFra == 0 ? 0x08 : 0x00, 0x08]
    ]);
    var sdm = Math.min(65535, Math.floor(32768 * vcoFra / pllRef));
    await writeEach(state, [
        [0x16, sdm >> 8, 0xff],
        [0x15, sdm & 0xff, 0xff]
    ]);
    await getPllLock(state, true);
    await writeRegMask(state, 0x1a, 0x08, 0x08);
    var actualFreq = 2 * pllRef * (nint + sdm / 65536) / mixDiv;
    return (actualFreq);
}

/**
 * Checks whether the PLL has achieved lock.
 * @param {boolean} firstTry Whether this is the first try to achieve lock.
 */
async function getPllLock(state: R820TState, firstTry: boolean): Promise<any> {
    var data = await readRegBuffer(state, 0x00, 3);
    var arr  = new Uint8Array(data);
    if (arr[2] & 0x40) {
        state.hasPllLock = true;
        return;
    }
    if (firstTry) {
        await writeRegMask(state, 0x12, 0x60, 0xe0);
        return await getPllLock(state, false);
    } else {
        state.hasPllLock = false;
        return;
    }
}


/**
 * Reads a series of registers into a buffer.
 * @param {number} addr The first register's address to read.
 * @param {number} length The number of registers to read.
 * @return {ArrayBuffer} An ArrayBuffer with the data.
 */
async function readRegBuffer(state: R820TState, addr: number, length: number) {
    var data = await usb.readI2CRegisterBuffer(state.device, 0x34, addr, length);
    // @ts-ignore
    var buf  = new Uint8Array(data);
    for (var i = 0; i < buf.length; ++i) {
        var b  = buf[i];
        buf[i] = (BIT_REVS[b & 0xf] << 4) | BIT_REVS[b >> 4];
    }
    return (buf.buffer);
}

