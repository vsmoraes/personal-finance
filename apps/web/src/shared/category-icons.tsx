import {
  CarOutlined,
  CoffeeOutlined,
  DollarOutlined,
  HomeOutlined,
  ShoppingOutlined,
  TagOutlined,
} from "@ant-design/icons";

/** Persist a stable icon key, never markup or a Unicode substitute. */
export const categoryIcons = [
  {
    value: "TagOutlined",
    label: "categories.other-expenses",
    icon: <TagOutlined />,
  },
  {
    value: "HomeOutlined",
    label: "categories.housing",
    icon: <HomeOutlined />,
  },
  {
    value: "ShoppingOutlined",
    label: "categories.shopping",
    icon: <ShoppingOutlined />,
  },
  {
    value: "CarOutlined",
    label: "categories.transportation",
    icon: <CarOutlined />,
  },
  {
    value: "CoffeeOutlined",
    label: "categories.dining",
    icon: <CoffeeOutlined />,
  },
  { value: "DollarOutlined", label: "income", icon: <DollarOutlined /> },
];
export function CategoryIcon({ name }: { name: string }) {
  return (
    categoryIcons.find((icon) => icon.value === name)?.icon ?? <TagOutlined />
  );
}
