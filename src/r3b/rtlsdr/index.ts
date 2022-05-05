import * as usb from "./usb"
import RTL2832U from "./demodulators/RTL2832U"

const FILTERS = [
    {
        vendorId:  0x0bda, // Realtek Semiconductor Corp.
        productId: 0x2832  // RTL2832U DVB-T
    },
    {
        vendorId:  0x0bda, // Realtek Semiconductor Corp.
        productId: 0x2838 // RTL2838 DVB-T
    }
];

export async function requestDevice() : Promise<RtlSdr>{
    let usbDevice = await navigator.usb.requestDevice({
        filters: FILTERS
    });

    return new RtlSdr(usbDevice);
}

export async function getDevices() {
    let usbDevices = await usb.getDevices(FILTERS);

    const sdrs: RtlSdr[] = [];

    usbDevices.forEach((usbDevice) => {
        sdrs.push(new RtlSdr(usbDevice));
    });

    return sdrs;
};

export default class RtlSdr {
    private device: USBDevice;
    private _rtl2832u?: RTL2832U;

    constructor(device: USBDevice) {
        this.device    = device;
        this._rtl2832u = undefined;
    }

    async open(options: any) {
        await this.device.open();
        await this.device.selectConfiguration(1);

        this._rtl2832u = new RTL2832U(this.device, options.ppm || 0, options.gain || null);

        await this._rtl2832u.open();
    };

    async setSampleRate(sampleRate: number) {
        if(this._rtl2832u === undefined) {
            throw Error("rtl2832u undefined in setSampleRate")
        }
        return this._rtl2832u.setSampleRate(sampleRate)
    };

    async setCenterFrequency(centerFrequency: number) {
        return this._rtl2832u?.setCenterFrequency(centerFrequency)
    };

    async resetBuffer() {
        await this._rtl2832u?.resetBuffer();
    };

    async readSamples(length: number) {
        if(this._rtl2832u === undefined) {
            throw Error("RTL2932I is undefined in readSamples")
        }
        return this._rtl2832u.readSamples(length)
    };

    async close() {
        await this._rtl2832u?.close();
        await this.device.close();
    };

};
