<script lang="ts">
    import router from "page";
    import Index from "./routes/Index.svelte";
    import Purpose from "./routes/Purpose.svelte";
    import Research from "./routes/Research.svelte";
    import Team from "./routes/Team.svelte";
    import Header from "./components/Header.svelte";
    import Test from "./routes/Test.svelte";
    import Shader from "./shaders/Shader.svelte";
    import Menu from "./components/Menu.svelte";
    import { menuOpen } from "./stores";

    let Page;

    const pages = {
        purpose: Purpose,
        research: Research,
        team: Team,
        test: Test,
    };

    router("/", (pageData) => {
        const path = pageData.state.path
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase() as string;
        if (pages[path]) {
            Page = pages[path];
        } else {
            Page = Index;
        }
    });
    router("/*", () => {
        router.redirect("/");
    });
    $: toRender = $menuOpen ? Menu : Page;
    router.start();
</script>

<Shader />
<Header />
<svelte:component this={toRender} />

<style global>
    body {
        padding-left: 24px;
        padding-right: 24px;
        overflow: auto;
    }
    ::selection {
        background: #ff44fc4b; /* WebKit/Blink Browsers */
    }
    ::-moz-selection {
        background: #ff44fc4b; /* Gecko Browsers */
    }
    h2 {
        font-size: 48px !important;
        line-height: 42px !important;
        border-bottom: 1px solid;
        margin-top: 16px !important;
        padding-bottom: 24px;
        font-weight: 300 !important;
    }
    h3 {
        font-size: 40px !important;
        line-height: 32px !important;
        /* border-bottom: 1px solid; */
        margin-top: 24px !important;
        padding-bottom: 24px;
        font-weight: 300 !important;
    }
    :global(.morpho-body-text) {
        margin-top: 8px;
        line-height: 40px;
        font-size: 32px;
        font-weight: 300;
        padding-bottom: 16px;
        border-bottom: 1px solid;
    }
    @media (max-width: 800px) {
        .morpho-body-text {
            margin-top: 8px;
            line-height: 32px;
            font-size: 24px;
            font-weight: 300;
            padding-bottom: 16px;
        }
        h2 {
            font-size: 40px !important;
            line-height: 36px !important;
            margin-top: 8px !important;
            padding-bottom: 16px;
        }
        h3 {
            font-size: 32px !important;
            line-height: 28px !important;
            margin-top: 16px !important;
            padding-bottom: 16px;
        }
    }
    :global(p::after) {
        content: "";
        height: 100%;
        display: inline-block;
    }
    :global(a::after) {
        content: "";
        height: 100%;
        display: inline-block;
    }
    :global(h2::after) {
        content: "";
        height: 100%;
        display: inline-block;
    }
    :global(h3::after) {
        content: "";
        height: 100%;
        display: inline-block;
    }
</style>
