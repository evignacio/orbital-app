import { Link } from 'react-router';
import { Icon } from '@/components/Icon';
import { SkyLayers } from '@/features/panel/SkyLayers';
import styles from './MessagePage.module.css';

interface Props {
  eyebrow: string;
  title: string;
  text: string;
}

// Página de aviso (rota desconhecida ou falha de carga): evita a tela de
// desenvolvedor do React Router. O <Link> mantém a navegação dentro da SPA.
// O céu é o do painel: estrelas no escuro, nuvens no claro.
export function MessagePage({ eyebrow, title, text }: Props) {
  return (
    <main className={styles.root}>
      <SkyLayers />
      <div className={styles.content}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{text}</p>
        <Link to="/" className={styles.back}>
          <Icon name="arrow-left" size={14} />
          Galáxia
        </Link>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <MessagePage
      eyebrow="ERRO 404"
      title="Página não encontrada"
      text="Este endereço não existe no Orbital."
    />
  );
}

export function RouteError() {
  return (
    <MessagePage
      eyebrow="ERRO"
      title="Algo deu errado"
      text="Algo deu errado ao carregar esta página."
    />
  );
}
