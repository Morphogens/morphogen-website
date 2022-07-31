export const makeRandGLSL = `
    highp float makeRand(vec2 co) {
        highp float a = 12.9898;
        highp float b = 78.233;
        highp float c = 43758.5453;
        highp float dt = dot(co.xy, vec2(a,b));
        highp float sn= mod(dt,3.14);
        return fract(sin(sn) * c);
    }
`

export const isClose = `
    bool isClose(float a, float b) {
        return abs(a - b) < .0001;
    }
`

export const sdAxisAlignedRect = `
    float sdAxisAlignedRect(vec2 uv, vec2 tl, vec2 br) {
        vec2 d = max(tl-uv, uv-br);
        return length(max(vec2(0.0), d)) + min(0.0, max(d.x, d.y));
    }
`
export const hsv2rgb = `
    vec3 hsv2rgb3(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    vec4 hsv2rgb(vec4 c) {
        return clamp(vec4(hsv2rgb3(c.xyz), c.a), 0., 1.);
    }
`