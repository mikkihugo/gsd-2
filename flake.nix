{
  description = "Minimal runtime shell for gsd-2";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bash
            bun
            cargo
            clippy
            git
            nodejs_24
            rust-analyzer
            rustc
            rustfmt
          ];

          shellHook = ''
            export GSD_SOURCE_DIR="${toString ./.}"
            export PATH="$GSD_SOURCE_DIR/bin:$PATH"

            echo "gsd-2 runtime shell"
            echo "  bun : $(command -v bun)"
            echo "  cargo: $(command -v cargo)"
            echo "  node: $(command -v node)"
            echo "  rustc: $(command -v rustc)"
          '';
        };
      });
}
