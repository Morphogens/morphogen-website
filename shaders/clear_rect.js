module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform vec4 rect;

            void main () {
                if (uv.x < rect.x) discard;
                if (uv.x > rect.z) discard;
                if (uv.y > 1.0 - rect.y) discard;
                if (uv.y < 1.0 - rect.w) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // if (uv.y == 1.0 - rect.y) {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
                // } else {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
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