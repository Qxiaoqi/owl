import Link from "next/link";

type BrandLinkProps = {
  href: string;
  title: string;
  subtitle: string;
};

export function BrandLink({ href, title, subtitle }: BrandLinkProps) {
  return (
    <Link className="brand" href={href}>
      <span className="brand-mark" aria-hidden="true">
        <img src="/owl-logo.png" alt="" />
      </span>
      <span className="brand-copy">
        <span>{title}</span>
        <span className="item-meta">{subtitle}</span>
      </span>
    </Link>
  );
}
