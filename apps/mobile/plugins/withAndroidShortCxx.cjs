const { withAppBuildGradle } = require('expo/config-plugins');

// Keep Ninja object paths below Windows MAX_PATH even with long codegen target names.
module.exports = function withAndroidShortCxx(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== 'groovy') throw new Error('TrainFlow CMake configuration expects a Groovy app build.gradle.');
    const marker = '// trainflow-short-cxx';
    if (!result.modResults.contents.includes(marker)) {
      result.modResults.contents += `\n${marker}\nandroid.externalNativeBuild.cmake.buildStagingDirectory = file("$rootDir/../../../.local/cxx")\n`;
    }
    return result;
  });
};
