const COLORS = {
  '00': ['white'],
  '01': ['black'],
  '02': ['navy'],
  '03': ['green'],
  '04': ['red'],
  '05': ['brown', 'maroon'],
  '06': ['purple', 'violet'],
  '07': ['olive'],
  '08': ['yellow'],
  '09': ['lightgreen', 'lime'],
  '10': ['teal', 'bluecyan'],
  '11': ['cyan', 'aqua'],
  '12': ['blue', 'royal'],
  '13': ['pink', 'lightpurple', 'fuchsia'],
  '14': ['gray', 'grey'],
  '15': ['lightgray', 'lightgrey', 'silver'],
};

const styles = {
  normal: '\x0F',
  underline: '\x1F',
  bold: '\x02',
  italic: '\x1D',
  inverse: '\x16',
  strikethrough: '\x1E',
  monospace: '\x11',
};

const styleChars = {};
Object.keys(styles).forEach(key => {
  styleChars[styles[key]] = true;
});

// Coloring character.
const c = '\x03';
const zero = styles.bold + styles.bold;
const badStr = /^,\d/;
const colorCodeStr = new RegExp(`^${c}\\d\\d`);

const allColors = {
  fg: [] as string[],
  bg: [] as string[],
  styles: Object.keys(styles),
  custom: [] as string[],
  extras: [] as string[],
};

// Make color functions for both foreground and background.
Object.entries(COLORS).forEach(([code, values]) => {
  // Foreground.
  // If the string begins with /,\d/,
  // it can undersirably apply a background color.
  let fg = (str: string) => c + code + (badStr.test(str) ? zero : '') + str + c;

  // Background.
  let bg = (str: string) => {
    // If the string begins with a foreground color already applied,
    // use it to save string space.
    if (colorCodeStr.test(str)) {
      let str2 = str.substr(3);
      return (
        str.substr(0, 3) + ',' + code + (str2.startsWith(zero) ? str2.substr(zero.length) : str2)
      );
    }

    return c + '01,' + code + str + c;
  };

  values.forEach(color => {
    allColors.fg.push(color);
    allColors.bg.push('bg' + color);
    exports[color] = fg;
    exports['bg' + color] = bg;
  });
});

// Style functions.
Object.entries(styles).forEach(([style, code]) => {
  exports[style] = (str: string) => code + str + code;
});

// Some custom helpers.
const custom = {
  rainbow: (str, colorArr) => {
    let rainbow = ['red', 'olive', 'yellow', 'green', 'blue', 'navy', 'violet'];
    colorArr = colorArr || rainbow;
    let l = colorArr.length;
    let i = 0;

    return (
      str
        .split('')
        // eslint-disable-next-line no-negated-condition
        .map(c => (c !== ' ' ? exports[colorArr[i++ % l]](c) : c))
        .join('')
    );
  },
};

Object.keys(custom).forEach(extra => {
  allColors.custom.push(extra);
  exports[extra] = custom[extra];
});

// Extras.
const extras = {
  // eslint-disable-next-line no-control-regex
  stripColors: (str: string) => str.replace(/\x03\d{0,2}(,\d{0,2}|\x02\x02)?/g, ''),

  stripStyle: (str: string) => {
    let path: Array<[string, number]> = [];
    for (let i = 0, len = str.length; i < len; i++) {
      let char = str[i];
      if (styleChars[char] || char === c) {
        let lastChar = path[path.length - 1];
        if (lastChar && lastChar[0] === char) {
          let p0 = lastChar[1];
          // Don't strip out styles with no characters inbetween.
          // And don't strip out color codes.
          if (i - p0 > 1 && char !== c) {
            str = str.slice(0, p0) + str.slice(p0 + 1, i) + str.slice(i + 1);
            i -= 2;
          }

          path.pop();
        } else {
          path.push([str[i], i]);
        }
      }
    }

    // Remove any unmatching style characterss.
    // Traverse list backwards to make removing less complicated.
    for (let char of path.reverse()) {
      if (char[0] !== c) {
        let pos = char[1];
        str = str.slice(0, pos) + str.slice(pos + 1);
      }
    }

    return str;
  },

  stripColorsAndStyle: (str: string) => exports.stripColors(exports.stripStyle(str)),
};

Object.keys(extras).forEach(extra => {
  allColors.extras.push(extra);
  exports[extra] = extras[extra];
});

// Adds all functions to each other so they can be chained.
const addGetters = (fn, types) => {
  Object.entries(allColors).forEach(([type, values]) => {
    if (types.indexOf(type) > -1) {
      return;
    }

    values.forEach(color => {
      if (fn[color] !== null) {
        return;
      }

      Object.defineProperty(fn, color, {
        get: () => {
          let f = str => exports[color](fn(str));
          addGetters(f, [...types, ...type]);
          return f;
        },
      });
    });
  });
};

Object.keys(allColors).forEach(type => {
  allColors[type].forEach(color => {
    addGetters(exports[color], [type]);
  });
});

export default extras;
