module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("content/style.css");

  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return new Date(dateObj).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  });

  return {
    dir: {
      input: "content",
      output: "../Blog",
      includes: "_includes",
    },
    pathPrefix: "/agentscript/apps/Blog/",
  };
};
