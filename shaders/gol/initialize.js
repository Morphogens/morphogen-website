module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D texture;
            uniform sampler2D random;
            varying vec2 uv;

            void main () {
                vec4 val = texture2D(texture, uv);
                vec4 rand = texture2D(random, uv);
                vec4 result = vec4(0.0, 0.0, 0.0, 1.0);

                result.z = rand.x;
                if (val.g > 0.5) {
                    result.y = 1.0;
                }
                if (val.g > 0.5 && rand.x > 0.1) {
                    result.x = 1.0;
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            texture: regl.prop('texture'),
            random: regl.prop('random')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}