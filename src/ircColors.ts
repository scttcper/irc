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

const styleChars: Record<string, boolean> = {
  '\x0F': true,
  '\x1F': true,
  '\x02': true,
  '\x1D': true,
  '\x16': true,
  '\x1E': true,
  '\x11': true,
};

// Coloring character.
const c = '\x03';
const zero = styles.bold + styles.bold;
const badStr = /^,\d/;
const colorCodeStr = new RegExp(`^${c}\\d\\d`);

// const allColors = {
//   fg: [] as string[],
//   bg: [] as string[],
//   styles: Object.keys(styles),
//   custom: [] as string[],
// };

const obj: Record<string, (str: string) => string> = {};

// // Make color functions for both foreground and background.
Object.entries(COLORS).forEach(([code, values]) => {
  // Foreground.
  // If the string begins with /,\d/,
  // it can undersirably apply a background color.
  const fg = (str: string) => c + code + (badStr.test(str) ? zero : '') + str + c;

  // Background.
  const bg = (str: string) => {
    // If the string begins with a foreground color already applied,
    // use it to save string space.
    if (colorCodeStr.test(str)) {
      const str2 = str.substring(3);
      return (
        str.substring(0, 3) +
        ',' +
        code +
        (str2.startsWith(zero) ? str2.substring(zero.length) : str2)
      );
    }

    return c + '01,' + code + str + c;
  };

  values.forEach(color => {
    // allColors.fg.push(color);
    // allColors.bg.push('bg' + color);
    obj[color] = fg;
    obj['bg' + color] = bg;
  });
});

// Style functions.
// Object.entries(styles).forEach(([style, code]) => {
//   obj[style] = (str: string) => code + str + code;
// });

// Some custom helpers.

export const rainbow = (str: string, colorArr: string[]) => {
  const rainbow = ['red', 'olive', 'yellow', 'green', 'blue', 'navy', 'violet'];
  colorArr = colorArr || rainbow;
  const l = colorArr.length;
  let i = 0;

  return (
    str
      .split('')
      .map(c => (c !== ' ' ? obj[colorArr[i++ % l]](c) : c))
      .join('')
  );
};

// Object.entries(custom).forEach(([extra, value]) => {
//   allColors.custom.push(extra);
//   obj[extra] = value;
// });

export const stripColors = (str: string) => str.replace(/\x03\d{0,2}(,\d{0,2}|\x02\x02)?/g, '');
export const stripStyle = (str: string) => {
  const path: [string, number][] = [];
  for (let i = 0, len = str.length; i < len; i++) {
    const char = str[i];
    if (styleChars[char] || char === c) {
      const lastChar = path[path.length - 1];
      if (lastChar && lastChar[0] === char) {
        const p0 = lastChar[1];
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
  for (const char of path.reverse()) {
    if (char[0] !== c) {
      const pos = char[1];
      str = str.slice(0, pos) + str.slice(pos + 1);
    }
  }

  return str;
};

export const stripColorsAndStyle = (str: string): string => stripColors(stripStyle(str));

// Adds all functions to each other so they can be chained.
// const addGetters = (fn: any, types: string[]) => {
//   Object.entries(allColors).forEach(([type, values]) => {
//     if (types.includes(type)) {
//       return;
//     }

//     values.forEach(color => {
//       if (fn[color] !== null) {
//         return;
//       }

//       Object.defineProperty(fn, color, {
//         get: () => {
//           const f = (str: string) => obj[color](fn(str));
//           addGetters(f, [...types, type]);
//           return f;
//         },
//       });
//     });
//   });
// };

// Object.entries(allColors).forEach(([type, value]) => {
//   value.forEach(color => {
//     addGetters(obj[color], [type]);
//   });
// });

export default obj;
