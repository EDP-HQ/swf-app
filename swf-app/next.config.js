/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['primereact', '@tremor/react'],
  eslint: {
    ignoreDuringBuilds: true
  }
};
