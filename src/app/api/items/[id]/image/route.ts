import { NextRequest, NextResponse } from 'next/server';
import { db, fail, handler, IMAGE_BUCKET, ITEM_SELECT, mapItem } from '@/lib/server';

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 4 * 1024 * 1024; // matches the bucket's file_size_limit

/** Upload or replace an item's photo (Supabase Storage), shown on the Sell screen. */
export const POST = handler(async (request: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const form = await request.formData();
  const file = form.get('image');
  if (!(file instanceof File)) return fail('An image file is required');
  if (!ALLOWED.includes(file.type)) return fail('Image must be a JPEG, PNG, WebP, or GIF');
  if (file.size > MAX_BYTES) return fail('Image must be 4 MB or smaller');

  const { data: item } = await db().from('items').select('id, image').eq('id', id).maybeSingle();
  if (!item) return fail('Item not found', 404);

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `items/${item.id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await db()
    .storage.from(IMAGE_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (uploadError) return fail(uploadError.message);

  if (item.image) {
    await db().storage.from(IMAGE_BUCKET).remove([item.image]);
  }

  const { data, error } = await db()
    .from('items')
    .update({ image: path, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ITEM_SELECT)
    .single();
  if (error) return fail(error.message);

  return NextResponse.json(mapItem(data));
});
