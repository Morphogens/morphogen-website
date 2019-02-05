module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 vUv;
            void main () {
                vUv = xy * 0.5 + 0.5;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 vUv;
            uniform vec4 rect;

            void main () {
                if (vUv.x < rect.x) discard;
                if (vUv.x > rect.z) discard;
                if (vUv.y > 1.0 - rect.y) discard;
                if (vUv.y < 1.0 - rect.w) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // if (vUv.y == 1.0 - rect.y) {
                //     // gl_FragColor = vec4(rand(vUv, 1.0), rand(vUv, 2.0)*0.25, rand(vUv, 2.0), rand(vUv, 3.0)*0.25);
                // } else {
                //     // gl_FragColor = vec4(rand(vUv, 1.0), rand(vUv, 2.0)*0.25, rand(vUv, 2.0), rand(vUv, 3.0)*0.25);
                //     // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            rect: regl.prop('rect')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}