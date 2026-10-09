import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const target=`http://127.0.0.1:${env.PORT||3000}`;
  return {server:{proxy:{'/api':target,'/health':target}}};
});
