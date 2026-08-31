import { ConversationProvider } from "@elevenlabs/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CanvasScreen } from "./src/screens/CanvasScreen";

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <ConversationProvider>
        <CanvasScreen />
      </ConversationProvider>
    </SafeAreaProvider>
  );
}
