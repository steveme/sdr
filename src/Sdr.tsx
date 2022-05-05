import React, {useEffect, useRef, useState} from 'react';
import RtlSdr, {requestDevice as sdrRequestDevice} from "./r3b/rtlsdr"
import {iqSamplesFromUint8} from "./r3b/rtlsdr/dsp"


function useSdr() {
    const sdrRef                                = useRef<RtlSdr>()
    const [sampleRate, setSampleRate]           = useState<number>(2000000);
    const [centerFrequency, setCenterFrequency] = useState<number>(1090000000);
    const [samples, setSamples]                 = useState<Array<Float32Array>>();


    console.log("use SDR called")

    async function requestDevice() {
        sdrRef.current = await sdrRequestDevice()
        console.log("device requested")
    }

    async function open() {
        console.log("Opening SDR")
        //
        // open the device
        //
        // supported options are:
        // - ppm: frequency correction factor, in parts per million (defaults to 0)
        // - gain: optional gain in dB, auto gain is used if not specified
        //
        await sdrRef.current?.open({
            ppm: 0.5
        });
        //
        // set sample rate and center frequency in Hz
        // - returns the actual values set
        //
        const actualSampleRate = await sdrRef.current?.setSampleRate(2000000);
        if (actualSampleRate !== undefined) {
            setSampleRate(actualSampleRate)
        }
        const actualCenterFrequency = await sdrRef.current?.setCenterFrequency(1090000000);
        if (actualCenterFrequency !== undefined) {
            setCenterFrequency(actualCenterFrequency)
        }
        //
        // reset the buffer
        //
        await sdrRef.current?.resetBuffer();

        console.log("SDR opened")

    }

    async function readSample() {
        console.log("Reading sample")
        //
        // read some samples
        // - returns an ArrayBuffer with the specified number of samples,
        //   data is interleaved in IQ format
        //
        if (sdrRef.current !== undefined) {

            const samples = await sdrRef.current.readSamples(16 * 16384);

            //
            // process the samples ...
            //
            if (samples !== undefined) {
                let iqSamples = iqSamplesFromUint8(samples, sampleRate)
                console.log("IQ samples: ", iqSamples)
                setSamples(iqSamples)

            }
        }
    }


    return [sampleRate, setSampleRate, centerFrequency, setCenterFrequency, requestDevice, open, readSample, samples] as const
}

export default function Sdr() {
    const [sampleRate, setSampleRate, centerFrequency, setCenterFrequency, requestDevice, open, readSample, samples] = useSdr()

    let samplesAsText = ""
    if(samples !== undefined && samples[0] !== undefined) {
        var I = samples[0];
        var Q = samples[1];
        for (var i = 0; i < I.length; ++i) {
            samplesAsText += "Idx: " + i + " I: "+ I[i]+ ", Q:" + Q[i] + "\n";
        }

    }
    return <div>
        <h1>Steves SDR</h1>
        <label>Sample Rate<input type="text" value={sampleRate}/></label><br/>
        <label>Center Frequency<input type="number" value={centerFrequency}/></label><br/>
        <button onClick={requestDevice}>Request Device</button>
        <br/>
        <button onClick={open}>Open</button>
        <br/>
        <button onClick={readSample}>Read Sample</button>
        <br/>
        <pre>{samplesAsText}</pre>
    </div>
}