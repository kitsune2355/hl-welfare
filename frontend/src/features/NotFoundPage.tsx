import { Compass } from 'lucide-react';
import { ButtonLink, Card, EmptyState } from '../ui';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass />}
        title="ไม่พบหน้าที่ต้องการ"
        description="ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว"
        action={
          <ButtonLink to="/" variant="primary">
            กลับหน้าภาพรวม
          </ButtonLink>
        }
      />
    </Card>
  );
}
