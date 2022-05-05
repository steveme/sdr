import * as usb from "../usb"
import {CMD, REG, BLOCK} from "../usb"

import * as R820T from "../tuners/R820T"


export default class RTL2832U {
    private device: USBDevice
    private ppm: number
    private opt_gain: number
    /**
     * Operations on the RTL2832U demodulator.
     * @param {ConnectionHandle} conn The USB connection handle.
     * @param {number} ppm The frequency correction factor, in parts per million.
     * @param {number=} opt_gain The optional gain in dB. If unspecified or null, sets auto gain.
     * @constructor
     */
    constructor(device: USBDevice, ppm: number, opt_gain: number) {
        this.device = device
        this.ppm = ppm
        this.opt_gain = opt_gain
    }

    /**
     * Frequency of the oscillator crystal.
     */
    private XTAL_FREQ = 28_800_000;

    /**
     * Tuner intermediate frequency.
     */
    private IF_FREQ = 357_0000;

    /**
     * The number of bytes for each sample.
     */
    private BYTES_PER_SAMPLE = 2;


    /**
     * The tuner used by the dongle.
     */
    private tuner? : R820T.R820TState;

    /**
     * Initialize the demodulator.
     */
    async open() {
        await usb.writeEach(this.device, [
            [CMD.REG, BLOCK.USB, REG.SYSCTL, 0x09, 1],
            [CMD.REG, BLOCK.USB, REG.EPA_MAXPKT, 0x0200, 2],
            [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0210, 2]
        ]);
        await usb.claimInterface(this.device);
        await usb.writeEach(this.device, [
            [CMD.REG, BLOCK.SYS, REG.DEMOD_CTL_1, 0x22, 1],
            [CMD.REG, BLOCK.SYS, REG.DEMOD_CTL, 0xe8, 1],
            [CMD.DEMODREG, 1, 0x01, 0x14, 1],
            [CMD.DEMODREG, 1, 0x01, 0x10, 1],
            [CMD.DEMODREG, 1, 0x15, 0x00, 1],
            [CMD.DEMODREG, 1, 0x16, 0x0000, 2],
            [CMD.DEMODREG, 1, 0x16, 0x00, 1],
            [CMD.DEMODREG, 1, 0x17, 0x00, 1],
            [CMD.DEMODREG, 1, 0x18, 0x00, 1],
            [CMD.DEMODREG, 1, 0x19, 0x00, 1],
            [CMD.DEMODREG, 1, 0x1a, 0x00, 1],
            [CMD.DEMODREG, 1, 0x1b, 0x00, 1],
            [CMD.DEMODREG, 1, 0x1c, 0xca, 1],
            [CMD.DEMODREG, 1, 0x1d, 0xdc, 1],
            [CMD.DEMODREG, 1, 0x1e, 0xd7, 1],
            [CMD.DEMODREG, 1, 0x1f, 0xd8, 1],
            [CMD.DEMODREG, 1, 0x20, 0xe0, 1],
            [CMD.DEMODREG, 1, 0x21, 0xf2, 1],
            [CMD.DEMODREG, 1, 0x22, 0x0e, 1],
            [CMD.DEMODREG, 1, 0x23, 0x35, 1],
            [CMD.DEMODREG, 1, 0x24, 0x06, 1],
            [CMD.DEMODREG, 1, 0x25, 0x50, 1],
            [CMD.DEMODREG, 1, 0x26, 0x9c, 1],
            [CMD.DEMODREG, 1, 0x27, 0x0d, 1],
            [CMD.DEMODREG, 1, 0x28, 0x71, 1],
            [CMD.DEMODREG, 1, 0x29, 0x11, 1],
            [CMD.DEMODREG, 1, 0x2a, 0x14, 1],
            [CMD.DEMODREG, 1, 0x2b, 0x71, 1],
            [CMD.DEMODREG, 1, 0x2c, 0x74, 1],
            [CMD.DEMODREG, 1, 0x2d, 0x19, 1],
            [CMD.DEMODREG, 1, 0x2e, 0x41, 1],
            [CMD.DEMODREG, 1, 0x2f, 0xa5, 1],
            [CMD.DEMODREG, 0, 0x19, 0x05, 1],
            [CMD.DEMODREG, 1, 0x93, 0xf0, 1],
            [CMD.DEMODREG, 1, 0x94, 0x0f, 1],
            [CMD.DEMODREG, 1, 0x11, 0x00, 1],
            [CMD.DEMODREG, 1, 0x04, 0x00, 1],
            [CMD.DEMODREG, 0, 0x61, 0x60, 1],
            [CMD.DEMODREG, 0, 0x06, 0x80, 1],
            [CMD.DEMODREG, 1, 0xb1, 0x1b, 1],
            [CMD.DEMODREG, 0, 0x0d, 0x83, 1]
        ]);

        var xtalFreq = Math.floor(this.XTAL_FREQ * (1 + this.ppm / 1000000));
        await usb.openI2C(this.device);
        var found = await R820T.checkR820T(this.device);
        if (found) {
            this.tuner = R820T.create(this.device, xtalFreq);
        }
        if (!this.tuner) {
            throw new Error('Sorry, your USB dongle has an unsupported tuner chip. ' +
                'Only the R820T chip is supported.');
        }
        var multiplier = -1 * Math.floor(this.IF_FREQ * (1<<22) / xtalFreq);
        await usb.writeEach(this.device, [
            [CMD.DEMODREG, 1, 0xb1, 0x1a, 1],
            [CMD.DEMODREG, 0, 0x08, 0x4d, 1],
            [CMD.DEMODREG, 1, 0x19, (multiplier >> 16) & 0x3f, 1],
            [CMD.DEMODREG, 1, 0x1a, (multiplier >> 8) & 0xff, 1],
            [CMD.DEMODREG, 1, 0x1b, multiplier & 0xff, 1],
            [CMD.DEMODREG, 1, 0x15, 0x01, 1]
        ])
        await R820T.init(this.tuner);
        await this.setGain(this.opt_gain);
        await usb.closeI2C(this.device);
    }

    /**
     * Sets the requested gain.
     * @param {number|null|undefined} gain The gain in dB, or null/undefined
     *     for automatic gain.
     */
    async setGain(gain? : number) {
        if(!this.tuner) {
            throw Error("Cannot change gain as tuner undefined")
        }
        if (gain == null) {
            await R820T.setAutoGain(this.tuner)
        } else {
            await R820T.setManualGain(this.tuner, gain)
        }
    }

    /**
     * Set the sample rate.
     * @param {number} rate The sample rate, in samples/sec.
     * @return {number} The sample rate that was actually set as its first parameter.
     */
    async setSampleRate(rate: number) {
        var ratio = Math.floor(this.XTAL_FREQ * (1 << 22) / rate);
        ratio &= 0x0ffffffc;
        var realRate = Math.floor(this.XTAL_FREQ * (1 << 22) / ratio);
        var ppmOffset = -1 * Math.floor(this.ppm * (1 << 24) / 1000000);
        await usb.writeEach(this.device, [
            [CMD.DEMODREG, 1, 0x9f, (ratio >> 16) & 0xffff, 2],
            [CMD.DEMODREG, 1, 0xa1, ratio & 0xffff, 2],
            [CMD.DEMODREG, 1, 0x3e, (ppmOffset >> 8) & 0x3f, 1],
            [CMD.DEMODREG, 1, 0x3f, ppmOffset & 0xff, 1]
        ]);
        await this.resetDemodulator();
        return realRate;
    }

    /**
     * Resets the demodulator.
     */
    async resetDemodulator() {
        await usb.writeEach(this.device, [
            [CMD.DEMODREG, 1, 0x01, 0x14, 1],
            [CMD.DEMODREG, 1, 0x01, 0x10, 1]
        ]);
    }

    /**
     * Tunes the device to the given frequency.
     * @param {number} freq The frequency to tune to, in Hertz.
     * @return {number} The actual tuned frequency.
     */
    async setCenterFrequency(freq: number) {
        await usb.openI2C(this.device);
        if (!this.tuner) {
            throw new Error('Sorry, your USB dongle has an unsupported tuner chip. ' +
                'Only the R820T chip is supported.');
        }
        var actualFreq = await R820T.setFrequency(this.tuner, freq + this.IF_FREQ);
        await usb.closeI2C(this.device);

        // @ts-ignore
        return (actualFreq - this.IF_FREQ);
    }

    /**
     * Resets the sample buffer. Call this before starting to read samples.
     */
    async resetBuffer() {
        await usb.writeEach(this.device, [
            [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0210, 2],
            [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0000, 2]
        ]);
    }

    /**
     * Reads a block of samples off the device.
     * @param {number} length The number of samples to read.
     * @return {ArrayBuffer} An ArrayBuffer containing the read samples, which you
     *     can interpret as pairs of unsigned 8-bit integers; the first one is
     *     the sample's I value, and the second one is its Q value.
     */
    async readSamples(length: number) {
        return await usb.readBulkBuffer(this.device, length * this.BYTES_PER_SAMPLE);
    }

    /**
     * Stops the demodulator.
     */
    async close() {
        await usb.openI2C(this.device)
        if(this.tuner) {
            await R820T.close(this.tuner)
        }
        await usb.closeI2C(this.device)
        await usb.releaseInterface(this.device)
    }
}

