export function nonNullable<X>(x: X): NonNullable<X> {
    if (x == null) throw new Error('Null check failed');
    return x as NonNullable<X>;
}
