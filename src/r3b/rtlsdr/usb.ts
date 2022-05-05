export async function deviceControlTransfer(device: USBDevice, ti: any) {
    console.log("deviceControlTransfer")
    if (ti.direction === 'out') {
        console.log("deviceControlTransfer - out")
        await device.controlTransferOut(ti, ti.data);
    } else if (ti.direction === 'in') {
        console.log("deviceControlTransfer - in", ti)
        const result = await device.controlTransferIn(ti, ti.length);
        console.log("deviceControlTransfer - in - result", result)
        return result.data?.buffer;
    }
}

export async function deviceBulkTransfer(device: USBDevice, ti: any) {
    const result = await device.transferIn(ti.endpoint, ti.length);
    return result.data?.buffer;
}

export async function getDevices(filters : USBDeviceFilter[]) {
    const usbDevices = await navigator.usb.getDevices();
    const devices : USBDevice[] = [];

    usbDevices.forEach((usbDevice) => {
        filters.forEach((filter) => {
            if (filter.vendorId === usbDevice.vendorId && filter.productId === usbDevice.productId) {
                devices.push(usbDevice);
            }
        });
    });
    return devices;
}

/**
 * Low-level communications with the RTL2832U-based dongle.
 * @param {ConnectionHandle} conn The USB connection handle.
 * @constructor
 */

/**
 * Commands for writeEach.
 */
export enum CMD {
    REG = 1,
    REGMASK = 2,
    DEMODREG = 3,
    I2CREG = 4
}

/**
 * Register blocks.
 */
export enum BLOCK {
    DEMOD = 0x000,
    USB = 0x100,
    SYS = 0x200,
    I2C = 0x600
}

/**
 * Device registers.
 */
export enum REG {
    SYSCTL = 0x2000,
    EPA_CTL = 0x2148,
    EPA_MAXPKT = 0x2158,
    DEMOD_CTL = 0x3000,
    DEMOD_CTL_1 = 0x300b
}

/**
 * Set in the control messages' index field for write operations.
 */
const WRITE_FLAG = 0x10;

/**
 * Whether to log all USB transfers.
 */
const VERBOSE = true;

/**
 * Writes a buffer into a dongle's register.
 * @param {number} block The register's block number.
 * @param {number} reg The register number.
 * @param {ArrayBuffer} buffer The buffer to write.
 */

async function writeRegBuffer(device: USBDevice, block: number, reg: number, buffer: ArrayBuffer) {
    await writeCtrlMsg(device, reg, block | WRITE_FLAG, buffer);
}
/**
 * Reads a buffer from a dongle's register.
 * @param device
 * @param {number} block The register's block number.
 * @param {number} reg The register number.
 * @param {number} length The length in bytes of the buffer to read.
 * @return {ArrayBuffer} The read buffer.
 */
async function readRegBuffer(device: USBDevice, block: number, reg: number, length: number) {
    return await readCtrlMsg(device, reg, block, length);
}
/**
 * Writes a value into a dongle's register.
 * @param device
 * @param {number} block The register's block number.
 * @param {number} reg The register number.
 * @param {number} value The value to write.
 * @param {number} length The width in bytes of this value.
 */
async function writeRegister(device: USBDevice, block: number, reg: number, value: number, length: number) {
    await writeCtrlMsg(device, reg, block | WRITE_FLAG, numberToBuffer(value, length));
}

/**
 * Reads a value from a dongle's register.
 * @param device
 * @param {number} block The register's block number.
 * @param {number} reg The register number.
 * @param {number} length The width in bytes of the value to read.
 * @return {number} The decoded value.
 */
async function readRegister(device: USBDevice, block: number, reg: number, length: number) {
    console.log("readResgiser", block, reg, length)
    let buffer = await readCtrlMsg(device, reg, block, length)
    // @ts-ignore
    return bufferToNumber(buffer);
}

/**
 * Writes a masked value into a dongle's register.
 * @param device
 * @param {number} block The register's block number.
 * @param {number} reg The register number.
 * @param {number} value The value to write.
 * @param {number} mask The mask for the value to write.
 */
async function writeRegisterMask(device: USBDevice, block: number, reg: number, value: number, mask: number) {
    if (mask == 0xff) {
        await writeRegister(device, block, reg, value, 1);
    } else {
        var old = await readRegister(device, block, reg, 1);
        value &= mask;
        // @ts-ignore
        old &= ~mask;
        // @ts-ignore
        value |= old;
        await writeRegister(device, block, reg, value, 1);
    }
}

/**
 * Reads a value from a demodulator register.
 * @param device
 * @param {number} page The register page number.
 * @param {number} addr The register's address.
 * @return {number} The decoded value.
 */
async function readDemodulatorRegister(device: USBDevice, page: number, addr: number) {
    return await readRegister(device, page, (addr << 8) | 0x20, 1);
}

/**
 * Writes a value into a demodulator register.
 * @param device
 * @param {number} page The register page number.
 * @param {number} addr The register's address.
 * @param {number} value The value to write.
 * @param {number} len The width in bytes of this value.
 */
async function writeDemodulatorRegister(device: USBDevice, page: number, addr: number, value: number, len: number) {
    await writeRegBuffer(device, page, (addr << 8) | 0x20, numberToBuffer(value, len, true));
    return await readDemodulatorRegister(device, 0x0a, 0x01);
}

/**
 * Opens the I2C repeater.
 */
export async function openI2C(device: USBDevice) {
    await writeDemodulatorRegister(device, 1, 1, 0x18, 1);
}

/**
 * Closes the I2C repeater.
 */
export async function closeI2C(device: USBDevice) {
    await writeDemodulatorRegister(device, 1, 1, 0x10, 1);
}

/**
 * Reads a value from an I2C register.
 * @param device
 * @param {number} addr The device's address.
 * @param {number} reg The register number.
 */
export async function readI2CRegister(device: USBDevice, addr: number, reg: number) {
    await writeRegBuffer(device, BLOCK.I2C, addr, new Uint8Array([reg]).buffer);
    return await readRegister(device, BLOCK.I2C, addr, 1);
}

/**
 * Writes a value to an I2C register.
 * @param device
 * @param {number} addr The device's address.
 * @param {number} reg The register number.
 * @param {number} value The value to write.
 */
export async function writeI2CRegister(device: USBDevice, addr: number, reg: number, value: number) {
    await writeRegBuffer(device, BLOCK.I2C, addr, new Uint8Array([reg, value]).buffer);
}

/**
 * Reads a buffer from an I2C register.
 * @param device
 * @param {number} addr The device's address.
 * @param {number} reg The register number.
 * @param {number} len The number of bytes to read.
 */
export async function readI2CRegisterBuffer(device: USBDevice, addr: number, reg: number, len: number) {
    await writeRegBuffer(device, BLOCK.I2C, addr, new Uint8Array([reg]).buffer);
    return await readRegBuffer(device, BLOCK.I2C, addr, len);
}

/**
 * Writes a buffer to an I2C register.
 * @param {number} addr The device's address.
 * @param {number} reg The register number.
 * @param {ArrayBuffer} buffer The buffer to write.
 */
async function writeI2CRegBuffer(device: USBDevice, addr: number, reg: number, buffer: ArrayBuffer) {
    var data = new Uint8Array(buffer.byteLength + 1);
    data[0] = reg;
    data.set(new Uint8Array(buffer), 1);
    await writeRegBuffer(device, BLOCK.I2C, addr, data.buffer);
}

/**
 * Decodes a buffer as a little-endian number.
 * @param {ArrayBuffer} buffer The buffer to decode.
 * @return {number} The decoded number.
 */
function bufferToNumber(buffer: ArrayBuffer) {
    console.log("bufferToNumber", buffer)
    var len = buffer.byteLength;
    var dv = new DataView(buffer);
    if (len == 0) {
        return null;
    } else if (len == 1) {
        return dv.getUint8(0);
    } else if (len == 2) {
        return dv.getUint16(0, true);
    } else if (len == 4) {
        return dv.getUint32(0, true);
    }
    throw 'Cannot parse ' + len + '-byte number';
}

/**
 * Encodes a number into a buffer.
 * @param {number} value The number to encode.
 * @param {number} len The number of bytes to encode into.
 * @param {boolean=} opt_bigEndian Whether to use a big-endian encoding.
 */
function numberToBuffer(value: number, len: number, opt_bigEndian? : boolean) {
    var buffer = new ArrayBuffer(len);
    var dv = new DataView(buffer);
    if (len == 1) {
        dv.setUint8(0, value);
    } else if (len == 2) {
        dv.setUint16(0, value, !opt_bigEndian);
    } else if (len == 4) {
        dv.setUint32(0, value, !opt_bigEndian);
    } else {
        throw 'Cannot write ' + len + '-byte number';
    }
    return buffer;
}

/**
 * Sends a USB control message to read from the device.
 * @param {number} value The value field of the control message.
 * @param {number} index The index field of the control message.
 * @param {number} length The number of bytes to read.
 */
async function readCtrlMsg(device: USBDevice, value: number, index: number, length: number) {
    var ti = {
        'requestType': 'vendor',
        'recipient': 'device',
        'direction': 'in',
        'request': 0,
        'value': value,
        'index': index,
        'length': Math.max(8, length)
    };
    try {
        console.log("read control message", length)
        var data = await deviceControlTransfer(device, ti);
        console.log("read control message 2")
        // @ts-ignore
        data = data.slice(0, length);
        if (VERBOSE) {
            console.log('IN value 0x' + value.toString(16) + ' index 0x' +
                index.toString(16));
            console.log('    read -> ' + dumpBuffer(data));
        }

        return data;
    } catch (error:any) {
        var msg = 'USB read failed (value 0x' + value.toString(16) +
            ' index 0x' + index.toString(16) + '), message="' + error.message + '"';
    };
}

/**
 * Sends a USB control message to write to the device.
 * @param {number} value The value field of the control message.
 * @param {number} index The index field of the control message.
 * @param {ArrayBuffer} buffer The buffer to write to the device.
 */
async function writeCtrlMsg(device: USBDevice, value: number, index: number, buffer: ArrayBuffer) {
    var ti = {
        'requestType': 'vendor',
        'recipient': 'device',
        'direction': 'out',
        'request': 0,
        'value': value,
        'index': index,
        'data': buffer
    };
    try {
        await deviceControlTransfer(device, ti);
        if (VERBOSE) {
            console.log('OUT value 0x' + value.toString(16) + ' index 0x' +
                index.toString(16) + ' data ' + dumpBuffer(buffer));
        }
    } catch (error: any) {
        var msg = 'USB write failed (value 0x' + value.toString(16) +
            ' index 0x' + index.toString(16) + ' data ' + dumpBuffer(buffer) +
            ') message="' +
            error.message + '"';
        throw msg;
    };
}

/**
 * Does a bulk transfer from the device.
 * @param {number} length The number of bytes to read.
 * @return {ArrayBuffer} The received buffer.
 */
export async function readBulkBuffer(device: USBDevice, length: number) {
    var ti = {
        'direction': 'in',
        'endpoint': 1,
        'length': length
    };
    try {
        var data = await deviceBulkTransfer(device, ti);
        if (VERBOSE) {
            // @ts-ignore
            console.log('IN BULK requested ' + length + ' received ' + data.byteLength);
        }
        return data;
    } catch (error: any) {
        var msg = 'USB bulk read failed (length 0x' + length.toString(16) +
            '), error="' +
            error.message + '"';
        throw msg;
    }
}

/**
 * Claims the USB interface.
 */
export async function claimInterface(device: USBDevice) {
    await device.claimInterface(0);
}

/**
 * Releases the USB interface.
 */
export async function releaseInterface(device: USBDevice) {
    await device.releaseInterface(0);
}

/**
 * Performs several write operations as specified in an array.
 * @param {Array.<Array.<number>>} array The operations to perform.
 */
export async function writeEach(device: USBDevice, array: Array<Array<number>>) {
    for (var index = 0; index < array.length; index++) {
        var line = array[index];
        if (line[0] == CMD.REG) {
            await writeRegister(device, line[1], line[2], line[3], line[4]);
        } else if (line[0] == CMD.REGMASK) {
            await writeRegisterMask(device, line[1], line[2], line[3], line[4]);
        } else if (line[0] == CMD.DEMODREG) {
            await writeDemodulatorRegister(device, line[1], line[2], line[3], line[4]);
        } else if (line[0] == CMD.I2CREG) {
            await writeI2CRegister(device, line[1], line[2], line[3]);
        } else {
            throw 'Unsupported operation [' + line + ']';
        }
    }
}

/**
 * Returns a string representation of a buffer.
 * @param {ArrayBuffer} buffer The buffer to display.
 * @return {string} The string representation of the buffer.
 */
function dumpBuffer(buffer: ArrayBuffer) {
    var bytes = [];
    var arr = new Uint8Array(buffer);
    for (var i = 0; i < arr.length; ++i) {
        bytes.push('0x' + arr[i].toString(16));
    }
    return '[' + bytes + ']';
}