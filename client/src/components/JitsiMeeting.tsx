import { useEffect, useRef } from 'react';

interface JitsiMeetingProps {
  roomName: string;
  displayName: string;
  email?: string;
  onReady?: () => void;
  onError?: (error: any) => void;
}

export default function JitsiMeeting({
  roomName,
  displayName,
  email,
  onReady,
  onError,
}: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);

  useEffect(() => {
    // Carregar script do Jitsi
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      initJitsi();
    };
    script.onerror = (error) => {
      console.error('Erro ao carregar Jitsi:', error);
      onError?.(error);
    };
    document.head.appendChild(script);

    return () => {
      // Limpar quando componente desmontar
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const initJitsi = () => {
    if (!containerRef.current || !window.JitsiMeetExternalAPI) {
      console.error('Container ou JitsiMeetExternalAPI não disponível');
      return;
    }

    try {
      const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: containerRef.current,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableModeratorIndicator: false,
          enableWelcomePage: false,
          enableClosePage: false,
          prejoinPageEnabled: false,
          disableProfile: false,
          disableRemoteControl: true,
          toolbarButtons: [
            'microphone',
            'camera',
            'closedcaptions',
            'desktop',
            'fullscreen',
            'fodeviceselection',
            'hangup',
            'profile',
            'chat',
            'recording',
            'livestreaming',
            'etherpad',
            'settings',
            'raisehand',
            'videoquality',
            'filmstrip',
            'invite',
            'feedback',
            'stats',
            'shortcuts',
            'tileview',
            'select-background',
            'download',
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          MOBILE_APP_PROMO: false,
          LANG_DETECTION: true,
          DEFAULT_LANGUAGE: 'pt-BR',
          SHOW_BRAND_WATERMARK: false,
          BRAND_WATERMARK_LINK: '',
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_VIDEO_BACKGROUND: false,
        },
        userInfo: {
          displayName: displayName,
          email: email,
        },
      };

      // @ts-ignore
      jitsiApiRef.current = new window.JitsiMeetExternalAPI(
        'meet.jit.si',
        options
      );

      // Eventos
      jitsiApiRef.current.addEventListener('videoConferenceJoined', () => {
        console.log('Usuário entrou na conferência');
        onReady?.();
      });

      jitsiApiRef.current.addEventListener('videoConferenceLocked', () => {
        console.log('Conferência bloqueada');
      });

      jitsiApiRef.current.addEventListener('videoConferenceLeft', () => {
        console.log('Usuário saiu da conferência');
      });

      jitsiApiRef.current.addEventListener('participantJoined', (data: any) => {
        console.log('Participante entrou:', data);
      });

      jitsiApiRef.current.addEventListener('participantLeft', (data: any) => {
        console.log('Participante saiu:', data);
      });

      jitsiApiRef.current.addEventListener('readyToClose', () => {
        console.log('Pronto para fechar');
      });
    } catch (error) {
      console.error('Erro ao inicializar Jitsi:', error);
      onError?.(error);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    />
  );
}

// Declarar tipo global para JitsiMeetExternalAPI
declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}
