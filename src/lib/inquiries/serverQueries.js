export async function hydrateInquiryRows(supabase, rows = []) {
  const references = [...new Set(rows.map((row) => row.reference).filter(Boolean))];

  if (references.length === 0) {
    return rows.map((row) => ({
      ...row,
      images: [],
      status_history: [],
    }));
  }

  const [{ data: images, error: imagesError }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from('inquiry_images')
      .select('*')
      .in('inquiry_reference', references)
      .order('created_at', { ascending: false }),
    supabase
      .from('inquiry_status_history')
      .select('*')
      .in('inquiry_reference', references)
      .order('created_at', { ascending: false }),
  ]);

  if (imagesError) {
    throw new Error(imagesError.message);
  }

  if (historyError) {
    throw new Error(historyError.message);
  }

  const imagesByReference = new Map();
  const historyByReference = new Map();

  for (const image of images || []) {
    const current = imagesByReference.get(image.inquiry_reference) || [];
    current.push(image);
    imagesByReference.set(image.inquiry_reference, current);
  }

  for (const item of history || []) {
    const current = historyByReference.get(item.inquiry_reference) || [];
    current.push(item);
    historyByReference.set(item.inquiry_reference, current);
  }

  return rows.map((row) => ({
    ...row,
    images: (imagesByReference.get(row.reference) || []).map((image) => ({
      ...image,
      public_url: image.public_url || image.publicUrl || image.url || '',
      filename: image.filename || image.name || 'cargo-image',
    })),
    status_history: historyByReference.get(row.reference) || [],
  }));
}

export async function hydrateInquiryRow(supabase, row) {
  const [hydrated] = await hydrateInquiryRows(supabase, row ? [row] : []);
  return hydrated || null;
}
