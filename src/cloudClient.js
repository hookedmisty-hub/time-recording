import {createClient} from '@supabase/supabase-js'
export const CLOUD_URL='https://tzelzjjoupexnukkoplr.supabase.co'
export const CLOUD_KEY='sb_publishable_R-hUZb57rNVSKmBUwT5UKQ_M8L7Ch4y'
export const cloudClient=createClient(CLOUD_URL,CLOUD_KEY)
// A request uses one captured account token throughout, even if another tab signs out.
export function accountClient(token){
  return createClient(CLOUD_URL,CLOUD_KEY,{accessToken:async()=>token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
