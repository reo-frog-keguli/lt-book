import { defineConfig } from 'vite'

// GitHub Pages では https://<ユーザー名>.github.io/<リポジトリ名>/ の下に置かれるので、
// 読み込み先をすべて相対パスにして、どの場所に置いても動くようにする
export default defineConfig({
  base: './',
})
