import type { Regl, Framebuffer } from 'regl'
export type RGBA = [number, number, number, number]
export type DataFn = (i:number, j:number) => RGBA

export function createFrameBuffer(
    regl:Regl,
    radius:number,
    dataFn?:DataFn
): Framebuffer{
    if (!dataFn) {        
        dataFn = ((i, j) => [0, 0, 0, 0])
    }    
    const data:number[][][] = Array(radius).fill(0).map((_, y_index) => (
        Array(radius).fill(0).map((_, x_index) => (
            dataFn(x_index/radius, y_index/radius)
        ))
    ))
    return regl.framebuffer({
        color: regl.texture({ 
            data,
            format: 'rgba',
            type: 'float'
        }),
        depthStencil: false,
        stencil: false,
    })
}

export function readBuffer(
    regl:Regl,
    framebuffer:Framebuffer
): Promise<Uint8Array | Float32Array> {
    return new Promise((resolve, reject) => {
        framebuffer.use(() => {
            resolve(regl.read())
        })
    })
}

export const setupQuad = {
    vert: `
        precision mediump float;
        attribute vec2 position;
        varying vec2 uv;
        void main() {
            uv = 0.5 * (position + 1.0);
            gl_Position = vec4(position, 0, 1);
        }
    `,
    attributes: {
        position: [ -4, -4, 4, -4, 0, 4 ]
    },
    depth: { enable: false },
    count: 3
}