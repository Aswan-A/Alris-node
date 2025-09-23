  import { createClient } from '@supabase/supabase-js';
  import dotenv from 'dotenv';

  dotenv.config();

  export const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_KEY as string
  );

  export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET as string;
