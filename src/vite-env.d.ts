/// reference types=\" "vite/client\  
  
interface ImportMetaEnv {  
  readonly VITE_WALLET_BYPASS: string;  
  readonly VITE_OPENCLAW_TOKEN?: string;  
}  
  
interface ImportMeta {  
  readonly env: ImportMetaEnv;  
} 
