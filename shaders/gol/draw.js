
function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return  [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
        1.0
    ]
}
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
            uniform sampler2D srcA;
            uniform sampler2D srcB;
            uniform vec2 u_size;

            uniform int show;
            uniform vec4 colorA;
            uniform vec4 colorB;
            uniform float interp;

            const vec4 WHITE = vec4( 1.0, 1.0, 1.0, 1.0 );

            float remap( float minval, float maxval, float curval ) {
                return ( curval - minval ) / ( maxval - minval );
            }

            void main() {
                vec4 pixelA = texture2D(srcA, uv);
                vec4 pixelB = texture2D(srcB, uv);
                float value = pixelA.x;

                if (interp == 1.0) {
                    value = (pixelA.x + pixelB.x) * 0.5;
                }

                /*
                float n = 0.0;
                n += texture2D(srcA, uv + vec2(0, -1)*u_size).x;
                n += texture2D(srcA, uv + vec2(0, +1)*u_size).x;
                n += texture2D(srcA, uv + vec2(-1, 0)*u_size).x;
                n += texture2D(srcA, uv + vec2(+1, 0)*u_size).x;
                */
                //value = (value > 0.0 && n > 0.0) ? n : 0.0;
                gl_FragColor = mix( WHITE, colorB, value );

            }
        `,
        uniforms: {
            colorA: regl.prop('colorA'),//hexToRgb("#0000e0"),
            colorB: regl.prop('colorB'),
            srcA: regl.prop('srcA'),
            srcB: regl.prop('srcB'),
            interp: regl.prop('interp'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
            show: 3,
        },
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        depth: {enable: false},
        count: 3
    });
}