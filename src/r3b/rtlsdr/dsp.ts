/**
 * Converts the given buffer of unsigned 8-bit samples into a pair of 32-bit
 *     floating-point sample streams.
 * @param {ArrayBuffer} buffer A buffer containing the unsigned 8-bit samples.
 * @param {number} rate The buffer's sample rate.
 * @return {Array.<Float32Array>} An array that contains first the I stream
 *     and next the Q stream.
 */
export function iqSamplesFromUint8(buffer: ArrayBuffer, rate: number) {
    var arr = new Uint8Array(buffer);
    var len = arr.length / 2;
    var outI = new Float32Array(len);
    var outQ = new Float32Array(len);
    for (var i = 0; i < len; ++i) {
        outI[i] = arr[2 * i] / 128 - 0.995;
        outQ[i] = arr[2 * i + 1] / 128 - 0.995;
    }
    return [outI, outQ];
}