import type { ReactNode } from "react";
import {
  siMariadb,
  siMongodb,
  siMysql,
  siPostgresql,
  siRedis,
  siSqlite,
  type SimpleIcon,
} from "simple-icons";

interface DriverIconProps {
  size?: number;
}

const iconProps = (size: number) => ({
  viewBox: "0 0 32 32",
  xmlns: "http://www.w3.org/2000/svg",
  width: size,
  height: size,
  "aria-hidden": true,
});

const BrandPathIcon = ({
  icon,
  size = 14,
}: DriverIconProps & { icon: SimpleIcon }): ReactNode => (
  <svg {...iconProps(size)} viewBox="0 0 24 24">
    <path d={icon.path} fill="currentColor" />
  </svg>
);

export const MySQLIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siMysql} size={size} />
);

export const PostgreSQLIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siPostgresql} size={size} />
);

export const SQLServerIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <svg {...iconProps(size)}>
    <path
      d="M7.1 26.4c3.1-1.7 6.6-3.8 10.3-6.4 3.9-2.8 6.6-5.4 8.1-7.9-2.3 1.2-5.1 1.8-8.3 1.9-3.6.1-6.4-.5-8.4-1.8 1.5 2.4 4.1 4.4 7.7 6.1-3.6 2.6-6.8 5.3-9.4 8.1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path
      d="M8.8 5.8c3 1.2 6.4 2.9 10.1 5.1M10.8 9.4c3.8.1 7.8.9 12 2.5M12.4 6.4c1 2.4 2.2 4.8 3.7 7.4M16.5 7.9c.2 2 .7 4.3 1.5 6.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      opacity=".75"
    />
  </svg>
);

export const OracleIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <svg {...iconProps(size)}>
    <rect
      x="5.5"
      y="10"
      width="21"
      height="12"
      rx="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
    />
  </svg>
);

export const SQLiteIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siSqlite} size={size} />
);

export const MariaDBIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siMariadb} size={size} />
);

export const MongoDBIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siMongodb} size={size} />
);

export const RedisIcon = ({ size = 14 }: DriverIconProps): ReactNode => (
  <BrandPathIcon icon={siRedis} size={size} />
);
