module.exports = {
    mode: 'jit',
    content: [
        './index.html',
        './resources/scripts/**/*.js',
        './resources/templates/**/*.html'
    ],
    theme: {
        container: {
            center: true,
            padding: '1rem',
        },
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#5A6C87',
                    '50': '#F1F2F3',
                    '100': '#C2CAD6',
                    '200': '#9DAABE',
                    '300': '#8595AD',
                    '400': '#6C809D',
                    '500': '#5A6C87',
                    '600': '#435165',
                    '700': '#2D3643',
                    '800': '#161B22',
                    '900': '#101418'
                },
            },
        },
    },
    plugins: [],
}
