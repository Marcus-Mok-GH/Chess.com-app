const isDevelopment = import.meta.env.DEV;

export const devLog = (...args) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

export const devWarn = (...args) => {
  if (isDevelopment) {
    console.warn(...args);
  }
};

export const devError = (...args) => {
  console.error(...args);
};
